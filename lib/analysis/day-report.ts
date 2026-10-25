import { revengeIds } from "@/lib/analysis/slices";
import { median, net, winRate } from "@/lib/analysis/stats";
import { dayKeyEt } from "@/lib/calendar";
import { fmtUsdPlain } from "@/lib/format";
import type { RoundTrip } from "@/lib/types";

/** Same lines the habit feed uses for a chase and for a buy well under the high. */
const NEAR_HIGH = 0.75;
const UNDER_HIGH = 0.45;

export const RATIONALITY_NOTE =
  "10 is a day the fills did not repeat the costly patterns. The score reads this day's behavior. It is not a prediction.";

export interface DayFill {
  id: string;
  symbol: string;
  pnlUsd: number;
  amountUsd: number;
}

export interface DayFinding {
  id: string;
  title: string;
  sentence: string;
}

export interface DayReport {
  dayKey: string;
  /** America/New_York calendar day, written out. */
  label: string;
  tradeCount: number;
  pnlUsd: number;
  /** Winning closes, best realized PnL first, at most three. */
  best: DayFill[];
  /** Losing closes, worst realized PnL first, at most three. */
  worst: DayFill[];
  noWinningTrade: boolean;
  /** Smallest loss, and only when it is honestly better than the worst loss. */
  leastBad: DayFill | null;
  biases: DayFinding[];
  rational: boolean;
  tendency: DayFinding | null;
  lead: string;
  /** 1–10, or null when the day has no closed trades. */
  score: number | null;
  why: string;
}

interface Built {
  id: string;
  title: string;
  phrase: string;
  body: string;
  impact: number;
}

interface Counts {
  n: number;
  revenge: number;
  near: number;
  reentry: number;
  adds: number;
  heavy: number;
  small: number;
  under: number;
  athKnown: number;
}

export function latestClosedDay(trades: { exitAt: string }[]): string | null {
  let latest: string | null = null;
  for (const trade of trades) {
    const key = dayKeyEt(trade.exitAt);
    if (!latest || key > latest) latest = key;
  }
  return latest;
}

export function endOfDayReport(trades: RoundTrip[], dayKey: string): DayReport {
  const label = dayHeading(dayKey);
  const day = chronological(trades).filter((trade) => dayKeyEt(trade.exitAt) === dayKey);
  const empty: DayReport = {
    dayKey,
    label,
    tradeCount: 0,
    pnlUsd: 0,
    best: [],
    worst: [],
    noWinningTrade: true,
    leastBad: null,
    biases: [],
    rational: false,
    tendency: null,
    lead: "No closed trades on this day.",
    score: null,
    why: "No closed trades to score.",
  };
  if (day.length === 0) return empty;

  const usual = median(trades.map((trade) => trade.amountUsd).filter((value) => value > 0));
  const usualLabel = usual > 0 ? fmtUsdPlain(usual) : "";
  const ordered = chronological(trades);
  const revenge = revengeIds(trades);
  const again = reentryIds(ordered);
  const revengeTrades = day.filter((trade) => revenge.has(trade.id));
  const flat = flatAfterLoss(ordered, dayKey, revenge, usual);
  const known = day.filter((trade) => (trade.athMarketCapUsd ?? 0) > 0 && trade.entryMarketCapUsd > 0);
  const near = known.filter((trade) => trade.entryMarketCapUsd >= (trade.athMarketCapUsd ?? 0) * NEAR_HIGH);
  const under = known.filter((trade) => trade.entryMarketCapUsd <= (trade.athMarketCapUsd ?? 0) * UNDER_HIGH);
  const reentryTrades = day.filter((trade) => again.has(trade.id));
  const multi = day.filter((trade) => trade.buys > 1);
  const once = day.filter((trade) => trade.buys <= 1);
  const heavy = day.filter((trade) => trade.liquidityUsd > 0 && trade.amountUsd >= trade.liquidityUsd * 0.02);
  const light = day.filter((trade) => trade.liquidityUsd > 0 && trade.amountUsd < trade.liquidityUsd * 0.01);
  const small = day.filter((trade) => usual <= 0 || trade.amountUsd <= usual * 1.05);

  const nearIds = new Set(near.map((trade) => trade.id));
  const heavyIds = new Set(heavy.map((trade) => trade.id));
  const marks = day.map((trade) => {
    if (revenge.has(trade.id) || nearIds.has(trade.id) || again.has(trade.id)) return 1;
    if (heavyIds.has(trade.id) || trade.buys > 1) return 0.5;
    return 0;
  });
  const counts: Counts = {
    n: day.length,
    revenge: revengeTrades.length,
    near: near.length,
    reentry: reentryTrades.length,
    adds: multi.length,
    heavy: heavy.length,
    small: small.length,
    under: under.length,
    athKnown: known.length,
  };
  const weight = behaviorWeight(marks, [
    { active: revengeTrades.length >= 3, share: revengeTrades.length / day.length },
    { active: near.length >= 3, share: near.length / day.length },
    { active: reentryQualifies(reentryTrades), share: reentryTrades.length / day.length },
  ]);

  const biases = biasFindings({
    revengeTrades,
    flat,
    day,
    near,
    under,
    known,
    reentryTrades,
    multi,
    once,
    heavy,
    light,
    usualLabel,
  });
  const tendency = biases.length === 0 ? paidTendency({ flat, revengeTrades, day, under, near, known, once, multi, usualLabel }) : null;
  const primary =
    revengeTrades.length >= 3 || near.length >= 3 || reentryQualifies(reentryTrades);
  const score = toScore(weight, biases.length > 0);
  const rational = score >= 8 && biases.length === 0;
  const why = whyLine(counts);
  const lead = leadLine({
    rational,
    primary,
    biases,
    tendency,
    usualLabel,
    counts,
    revengeTrades,
    near,
    reentryTrades,
  });

  const wins = [...day].filter((trade) => trade.pnlUsd > 0).sort(byBest);
  const losses = [...day].filter((trade) => trade.pnlUsd < 0).sort(byWorst);
  return {
    dayKey,
    label,
    tradeCount: day.length,
    pnlUsd: day.reduce((sum, trade) => sum + trade.pnlUsd, 0),
    best: wins.slice(0, 3).map(fillOf),
    worst: losses.slice(0, 3).map(fillOf),
    noWinningTrade: wins.length === 0,
    leastBad: wins.length === 0 ? leastBadClose(losses) : null,
    biases: biases.map(publish),
    rational,
    tendency: tendency ? asTendency(tendency) : null,
    lead,
    score,
    why,
  };
}

/**
 * 10 means every close avoided the costly patterns.
 * A close that sized up after a loss, bought near the high, or re-entered a red coin counts fully.
 * Adding to a coin, or a ticket that is large for the pool, counts half.
 * When revenge sizing, chasing, or re-entry repeats (the same cluster bar as the habit feed),
 * that pattern's share is lifted so a run of them cannot hide behind a pile of small tickets.
 * A named bias cannot score as a clean day. One costly fill cannot round back up to 10.
 */
function behaviorWeight(marks: number[], clusters: { active: boolean; share: number }[]): number {
  const mean = marks.reduce((sum, mark) => sum + mark, 0) / marks.length;
  const strong = clusters.filter((cluster) => cluster.active);
  if (strong.length === 0) return mean;
  const worst = Math.max(...strong.map((cluster) => cluster.share));
  const lifted = Math.min(1, worst + 0.25 + 0.1 * (strong.length - 1));
  return Math.max(mean, lifted);
}

function toScore(weight: number, namedBias: boolean): number {
  let score = Math.round(10 - 9 * weight);
  if (score > 10) score = 10;
  if (score < 1) score = 1;
  if (weight > 0 && score === 10) score = 9;
  if (namedBias && score > 6) score = 6;
  return score;
}

function biasFindings(input: {
  revengeTrades: RoundTrip[];
  flat: RoundTrip[];
  day: RoundTrip[];
  near: RoundTrip[];
  under: RoundTrip[];
  known: RoundTrip[];
  reentryTrades: RoundTrip[];
  multi: RoundTrip[];
  once: RoundTrip[];
  heavy: RoundTrip[];
  light: RoundTrip[];
  usualLabel: string;
}): Built[] {
  const out: Built[] = [];
  const { revengeTrades, flat, day, near, under, known, reentryTrades, multi, once, heavy, light, usualLabel } = input;
  if (worth("negative", revengeTrades, flat.length >= 3 ? flat : others(day, revengeTrades))) {
    const usualBit = usualLabel ? `, to at least 1.35× your usual ${usualLabel}` : "";
    out.push(
      built(
        "size-after-loss",
        "Revenge trading",
        "revenge trading",
        `${noun(revengeTrades.length, "close", "closes")} sized up after a loss${usualBit}, and those dropped ${money(revengeTrades)}${including(revengeTrades, true)}`,
        revengeTrades,
      ),
    );
  }
  if (worth("negative", near, under.length >= 3 ? under : others(known, near))) {
    out.push(
      built(
        "ath-near",
        "FOMO",
        "FOMO",
        `${noun(near.length, "entry", "entries")} were at least 75% of that coin's high, and those dropped ${money(near)}${including(near, true)}`,
        near,
      ),
    );
  }
  if (reentryQualifies(reentryTrades)) {
    out.push(
      built(
        "reentry",
        "Sunk-cost fallacy",
        "the sunk-cost fallacy",
        `${noun(reentryTrades.length, "later close", "later closes")} were the same coin after a red close, and those dropped ${money(reentryTrades)}${including(reentryTrades, true)}`,
        reentryTrades,
      ),
    );
  }
  if (worth("negative", multi, once)) {
    out.push(
      built(
        "adds",
        "Added to the same coin",
        "adding to the same coin",
        `${noun(multi.length, "coin", "coins")} were bought more than once, and those dropped ${money(multi)}${including(multi, true)}`,
        multi,
      ),
    );
  }
  if (worth("negative", heavy, light.length >= 3 ? light : others(day, heavy))) {
    out.push(
      built(
        "heavy-pool",
        "The ticket was large for the pool",
        "a ticket large for the pool",
        `${noun(heavy.length, "ticket", "tickets")} were at least 2% of the pool, and those dropped ${money(heavy)}${including(heavy, true)}`,
        heavy,
      ),
    );
  }
  return out.sort(byImpact);
}

function paidTendency(input: {
  flat: RoundTrip[];
  revengeTrades: RoundTrip[];
  day: RoundTrip[];
  under: RoundTrip[];
  near: RoundTrip[];
  known: RoundTrip[];
  once: RoundTrip[];
  multi: RoundTrip[];
  usualLabel: string;
}): Built | null {
  const { flat, revengeTrades, day, under, near, known, once, multi, usualLabel } = input;
  const out: Built[] = [];
  if (worth("positive", flat, revengeTrades.length >= 3 ? revengeTrades : others(day, flat))) {
    const usualBit = usualLabel ? `your usual ${usualLabel}` : "your usual ticket";
    out.push(
      built(
        "size-flat-after-loss",
        "Kept the ticket flat after a loss",
        "keeping the ticket flat after a loss",
        `${noun(flat.length, "next ticket", "next tickets")} stayed at or under ${usualBit}, and those made ${gained(flat)}${including(flat, false)}`,
        flat,
      ),
    );
  }
  const nearRest = under.length >= 3 ? under : others(known, near);
  const underRest = near.length >= 3 ? near : others(known, under);
  if (!worth("negative", near, nearRest) && worth("positive", near, nearRest)) {
    out.push(
      built(
        "ath-near-paid",
        "Got paid near the high",
        "getting paid near the high",
        `${noun(near.length, "entry", "entries")} were at least 75% of that coin's high, and those made ${gained(near)}${including(near, false)}`,
        near,
      ),
    );
  }
  if (worth("positive", under, underRest)) {
    out.push(
      built(
        "ath-off",
        "Bought well under the high",
        "buying well under the high",
        `${noun(under.length, "entry", "entries")} were at or under 45% of that coin's high, and those made ${gained(under)}${including(under, false)}`,
        under,
      ),
    );
  }
  if (worth("positive", once, multi) && multi.length >= 3) {
    out.push(
      built(
        "one-ticket",
        "One ticket per coin",
        "one ticket per coin",
        `${noun(once.length, "coin", "coins")} were bought once, and those made ${gained(once)}${including(once, false)}`,
        once,
      ),
    );
  }
  out.sort(byImpact);
  return out[0] ?? null;
}

function leadLine(input: {
  rational: boolean;
  primary: boolean;
  biases: Built[];
  tendency: Built | null;
  usualLabel: string;
  counts: Counts;
  revengeTrades: RoundTrip[];
  near: RoundTrip[];
  reentryTrades: RoundTrip[];
}): string {
  const { rational, primary, biases, tendency, usualLabel, counts, revengeTrades, near, reentryTrades } = input;
  if (biases.length > 0) {
    return biases
      .map((bias, index) =>
        index === 0 ? `The dominant bias was ${bias.phrase}: ${bias.body}.` : `${bias.title}: ${bias.body}.`,
      )
      .join(" ");
  }
  if (rational && tendency) return `You traded more rationally that day. ${asTendency(tendency).sentence}`;
  if (rational) {
    const detail = rationalDetail(counts, usualLabel);
    return detail ? `You traded more rationally that day. ${detail}` : "You traded more rationally that day.";
  }
  const behavior = behaviorLead(revengeTrades, near, reentryTrades);
  if (primary && behavior) return behavior;
  if (tendency) return asTendency(tendency).sentence;
  return behavior || "The closes do not settle on one bias.";
}

function rationalDetail(counts: Counts, usualLabel: string): string {
  const parts: string[] = [];
  if (counts.n > 0 && counts.small === counts.n && usualLabel) parts.push(`every close stayed at or under your usual ${usualLabel}`);
  if (counts.revenge === 0) parts.push("nothing sized up after a loss");
  if (counts.athKnown > 0 && counts.near === 0) parts.push("no close with a known high bought near it");
  if (parts.length === 0) return "";
  return capitalize(joinAnd(parts)) + ".";
}

function behaviorLead(revengeTrades: RoundTrip[], near: RoundTrip[], reentryTrades: RoundTrip[]): string {
  const parts: string[] = [];
  if (revengeTrades.length > 0) {
    parts.push(
      `you sized up after a loss on ${noun(revengeTrades.length, "close", "closes")}, and those ${resultWord(revengeTrades)} ${money(revengeTrades)}`,
    );
  }
  if (near.length > 0) {
    parts.push(
      `${noun(near.length, "entry", "entries")} were at least 75% of the high, and those ${resultWord(near)} ${money(near)}`,
    );
  }
  if (reentryTrades.length > 0) {
    parts.push(
      `${noun(reentryTrades.length, "close", "closes")} came back to a coin after a red close, and those ${resultWord(reentryTrades)} ${money(reentryTrades)}`,
    );
  }
  if (parts.length === 0) return "";
  return capitalize(joinAnd(parts)) + ".";
}

function whyLine(counts: Counts): string {
  const primary: string[] = [];
  if (counts.revenge >= 2) primary.push("sizing up after a loss");
  else if (counts.revenge === 1) primary.push("a size-up after a loss");
  if (counts.near >= 2) primary.push("buying near the high");
  else if (counts.near === 1) primary.push("a buy near the high");
  if (counts.reentry >= 2) primary.push("re-entering losers");
  else if (counts.reentry === 1) primary.push("a re-entry after a red close");
  if (primary.length > 0) return `The score reads ${joinAnd(primary)} in this day's closes.`;

  if (counts.adds === 0 && counts.heavy === 0) return cleanWhy(counts);

  const slips: string[] = [];
  if (counts.adds === 1) slips.push("one coin was bought more than once");
  else if (counts.adds > 1) slips.push(`${counts.adds} coins were bought more than once`);
  if (counts.heavy === 1) slips.push("one ticket was large for the pool");
  else if (counts.heavy > 1) slips.push(`${counts.heavy} tickets were large for the pool`);
  const rest: string[] = [];
  if (counts.n > 0 && counts.small === counts.n) rest.push("the other closes stayed small");
  if (counts.revenge === 0) rest.push("nothing sized up after a loss");
  if (counts.athKnown > 0 && counts.near === 0) rest.push("nothing bought near the high");
  if (rest.length === 0) return `${capitalize(joinAnd(slips))}.`;
  return `${capitalize(joinAnd(slips))}, while ${joinAnd(rest)}.`;
}

function cleanWhy(counts: Counts): string {
  const details: string[] = [];
  if (counts.n > 0 && counts.small === counts.n) details.push("the tickets stayed small");
  if (counts.revenge === 0) details.push("nothing sized up after a loss");
  if (counts.athKnown > 0 && counts.under === counts.athKnown) details.push("entries stayed at or under 45% of the high");
  else if (counts.athKnown > 0 && counts.near === 0) details.push("entries stayed off the high");
  if (details.length === 0) return "The fills did not repeat a costly pattern.";
  return `The fills did not repeat a costly pattern: ${joinAnd(details)}.`;
}

function leastBadClose(losses: RoundTrip[]): DayFill | null {
  if (losses.length < 2) return null;
  const worst = losses[0];
  const least = losses[losses.length - 1];
  if (!(least.pnlUsd < 0) || !(worst.pnlUsd < 0)) return null;
  if (Math.abs(worst.pnlUsd) + 1e-9 < Math.abs(least.pnlUsd) * 2) return null;
  return fillOf(least);
}

function flatAfterLoss(ordered: RoundTrip[], dayKey: string, revenge: Set<string>, usual: number): RoundTrip[] {
  if (usual <= 0) return [];
  const kept: RoundTrip[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (dayKeyEt(current.exitAt) !== dayKey) continue;
    if (previous.pnlUsd < 0 && !revenge.has(current.id) && current.amountUsd <= usual * 1.05) kept.push(current);
  }
  return kept;
}

function reentryIds(ordered: RoundTrip[]): Set<string> {
  const lost = new Set<string>();
  const again = new Set<string>();
  for (const trade of ordered) {
    if (lost.has(trade.mint)) again.add(trade.id);
    if (trade.pnlUsd < 0) lost.add(trade.mint);
  }
  return again;
}

function reentryQualifies(again: RoundTrip[]): boolean {
  if (again.length < 2 || net(again) >= 0) return false;
  if (again.length < 3 && again.some((trade) => trade.pnlUsd >= 0)) return false;
  return true;
}

/** Same bar the habit feed uses before it will name a cluster. */
function worth(tone: "positive" | "negative", group: RoundTrip[], rest: RoundTrip[], min = 3): boolean {
  if (group.length < min) return false;
  if (tone === "negative") {
    if (net(group) >= 0) return false;
    if (rest.length < 3) return winRate(group) <= 0.4;
    return winRate(group) + 0.12 <= winRate(rest) || net(rest) > 0;
  }
  if (net(group) <= 0) return false;
  if (rest.length < 3) return winRate(group) >= 0.5;
  return winRate(group) >= winRate(rest) + 0.12 || net(rest) < 0;
}

function built(id: string, title: string, phrase: string, body: string, group: RoundTrip[]): Built {
  return { id, title, phrase, body, impact: Math.abs(net(group)) };
}

function publish(finding: Built): DayFinding {
  return { id: finding.id, title: finding.title, sentence: `${finding.title}: ${finding.body}.` };
}

function asTendency(finding: Built): DayFinding {
  return {
    id: finding.id,
    title: finding.title,
    sentence: `The tendency that paid was ${finding.phrase}: ${finding.body}.`,
  };
}

function resultWord(group: RoundTrip[]): string {
  return net(group) >= 0 ? "made" : "dropped";
}

function money(group: RoundTrip[]): string {
  return fmtUsdPlain(Math.abs(net(group)));
}

function gained(group: RoundTrip[]): string {
  return fmtUsdPlain(net(group));
}

function including(group: RoundTrip[], worst: boolean): string {
  const names = topSymbols(group, worst, 3);
  if (names.length === 0) return "";
  return `, including ${joinAnd(names)}`;
}

function topSymbols(group: RoundTrip[], worst: boolean, limit: number): string[] {
  const ranked = [...group].sort((left, right) => (worst ? left.pnlUsd - right.pnlUsd : right.pnlUsd - left.pnlUsd));
  const names: string[] = [];
  for (const trade of ranked) {
    if (names.includes(trade.symbol)) continue;
    names.push(trade.symbol);
    if (names.length === limit) break;
  }
  return names;
}

function fillOf(trade: RoundTrip): DayFill {
  return { id: trade.id, symbol: trade.symbol, pnlUsd: trade.pnlUsd, amountUsd: trade.amountUsd };
}

function byBest(left: RoundTrip, right: RoundTrip): number {
  return right.pnlUsd - left.pnlUsd || left.id.localeCompare(right.id);
}

function byWorst(left: RoundTrip, right: RoundTrip): number {
  return left.pnlUsd - right.pnlUsd || left.id.localeCompare(right.id);
}

function byImpact(left: Built, right: Built): number {
  return right.impact - left.impact || left.title.localeCompare(right.title);
}

function chronological(trades: RoundTrip[]): RoundTrip[] {
  return [...trades].sort((left, right) => left.entryAt.localeCompare(right.entryAt) || left.id.localeCompare(right.id));
}

function others(trades: RoundTrip[], group: RoundTrip[]): RoundTrip[] {
  const ids = new Set(group.map((trade) => trade.id));
  return trades.filter((trade) => !ids.has(trade.id));
}

function dayHeading(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function noun(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
