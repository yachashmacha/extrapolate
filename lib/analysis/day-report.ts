import { bookBounds } from "@/lib/analysis/bounds";
import { fomoStatus } from "@/lib/analysis/fomo";
import { narrativeScore } from "@/lib/analysis/narrative";
import { revengeIds, SIZE_UP, sizeMultiple } from "@/lib/analysis/slices";
import { median, net, winRate } from "@/lib/analysis/stats";
import { baseTicketSentence } from "@/lib/analysis/tips";
import { dayKeyEt } from "@/lib/calendar";
import { fmtUsdPlain } from "@/lib/format";
import { activePaceRule, dayBreachSentence, paceOverIds, ruleBreak, type TradingRule } from "@/lib/rules";
import type { RoundTrip } from "@/lib/types";

/** Same line the habit feed uses for a buy well under the high. */
const UNDER_HIGH = 0.45;

export const RATIONALITY_NOTE =
  "100% is a day the trades did not repeat the costly patterns, no active rule was broken, and the close was not negative. A red day cannot be 100%. The score reads this day's behavior. It is not a prediction.";

export interface DayFill {
  id: string;
  symbol: string;
  pnlUsd: number;
  amountUsd: number;
  /** Set when this close broke an active base rule. */
  note?: string;
  /** The coin's story, an integer 1–10. The day percent uses the average only as a small nudge. */
  narrativeScore: number;
  /** The one or two factors that set the narrative score. */
  narrative: string;
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
  /** Rationality as a percent from 1 to 100, or null when the day has no closed trades. */
  score: number | null;
  why: string;
  /** The base-ticket ceiling, when the portfolio is known. */
  sizeNote: string;
}

export interface DayScoreContext {
  rules?: TradingRule[] | null;
  accountUsd?: number | null;
  cashUsd?: number | null;
  /** Cost basis still open. Used only to rebuild the portfolio at each entry. */
  opens?: { entryAt: string; costUsd: number }[] | null;
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
  fomo: number;
  fomoUnknown: number;
  reentry: number;
  adds: number;
  aboveUsual: number;
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

export function endOfDayReport(trades: RoundTrip[], dayKey: string, context?: DayScoreContext): DayReport {
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
    sizeNote: "",
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
  const under = known.filter((trade) => trade.entryMarketCapUsd <= (trade.athMarketCapUsd ?? 0) * UNDER_HIGH);
  const fomoTrades = day.filter((trade) => fomoStatus(trade) === "yes");
  const fomoUnknown = day.filter((trade) => fomoStatus(trade) === "unknown").length;
  const reentryTrades = day.filter((trade) => again.has(trade.id));
  const down = day.filter((trade) => trade.averagedDown === true);
  const multi = day.filter((trade) => trade.buys > 1);
  const once = day.filter((trade) => trade.buys <= 1);
  const aboveUsual = day.filter((trade) => usual > 0 && trade.amountUsd >= usual * SIZE_UP);
  const small = day.filter((trade) => usual <= 0 || trade.amountUsd <= usual * 1.05);

  const fomoIds = new Set(fomoTrades.map((trade) => trade.id));
  const aboveIds = new Set(aboveUsual.map((trade) => trade.id));
  const downIds = new Set(down.map((trade) => trade.id));
  const marks = day.map((trade) => {
    if (revenge.has(trade.id) || fomoIds.has(trade.id) || again.has(trade.id)) return 1;
    if (aboveIds.has(trade.id) || downIds.has(trade.id)) return 0.5;
    return 0;
  });
  const counts: Counts = {
    n: day.length,
    revenge: revengeTrades.length,
    fomo: fomoTrades.length,
    fomoUnknown,
    reentry: reentryTrades.length,
    adds: down.length,
    aboveUsual: aboveUsual.length,
    small: small.length,
    under: under.length,
    athKnown: known.length,
  };
  const weight = behaviorWeight(marks, [
    { active: revengeTrades.length >= 3, share: revengeTrades.length / day.length },
    { active: fomoTrades.length >= 3, share: fomoTrades.length / day.length },
    { active: reentryQualifies(reentryTrades), share: reentryTrades.length / day.length },
  ]);

  const biases = biasFindings({
    revengeTrades,
    flat,
    day,
    fomoTrades,
    under,
    known,
    reentryTrades,
    down,
    once,
    aboveUsual,
    usual,
    usualLabel,
  });
  const tendency = biases.length === 0 ? paidTendency({ flat, revengeTrades, day, fomoTrades, under, known, once, multi, usualLabel }) : null;
  const revengeCluster = revengeTrades.length >= 3;
  const fomoCluster = fomoTrades.length >= 3;
  const reentryCluster = reentryQualifies(reentryTrades);
  const namedBias = biases.length > 0;
  const pnlUsd = day.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  const turnoverUsd = day.reduce((sum, trade) => sum + Math.max(0, trade.amountUsd), 0);
  const marked = day.filter((_, index) => marks[index] > 0);
  const markedNet = marked.length ? net(marked) : 0;
  const patternLoss = markedNet < 0 ? -markedNet : 0;
  const cluster = revengeCluster || fomoCluster || reentryCluster;
  // A repeated pattern leads the copy when it is named, or when the day still closed green.
  // On a small red day the unnamed marks are only a few points, so the lead stays with the tickets.
  const primary = namedBias || pnlUsd >= 0 ? cluster : false;
  const fomoInScore = biases.some((bias) => bias.id === "fomo") || (pnlUsd >= 0 && fomoCluster);
  const breaks = day.map((trade) =>
    ruleBreak(trade, trades, {
      rules: context?.rules,
      accountUsd: context?.accountUsd ?? null,
      cashUsd: context?.cashUsd ?? null,
      opens: context?.opens,
    }),
  );
  const pastStop = day.filter((_, index) => breaks[index]?.stop);
  const oversized = day.flatMap((trade, index) => {
    const hit = breaks[index];
    if (!hit?.size) return [];
    return [{ ...trade, portfolioUsd: hit.portfolioUsd }];
  });
  const pace = activePaceRule(context?.rules);
  const overPace = new Set(pace ? paceOverIds(day, pace.limit) : []);
  const brokenIds = new Set<string>();
  for (const trade of pastStop) brokenIds.add(trade.id);
  for (const trade of oversized) brokenIds.add(trade.id);
  for (const id of overPace) brokenIds.add(id);
  const broken = brokenIds.size;
  const behaviorScore = toScore({ weight, namedBias, cluster, pnlUsd, turnoverUsd, patternLoss });
  const ruled = applyBaseRuleScore(behaviorScore, broken, day.length);
  const score = applyNarrativeNudge(
    ruled,
    day.map((trade) => narrativeScore(trade, trades).score),
  );
  const rational = pnlUsd >= 0 && !namedBias && score >= 80 && broken === 0;
  let why = whyForScore(whyLine(counts, fomoInScore), pnlUsd, namedBias);
  let lead = leadLine({
    rational,
    primary,
    biases,
    tendency,
    usualLabel,
    counts,
    revengeTrades,
    fomoTrades,
    reentryTrades,
    pnlUsd,
  });
  const breach = dayBreachSentence(pastStop, oversized, context?.rules, day.length);
  if (breach) {
    lead = `${lead} ${breach}`;
    why = `${why} A broken base rule lowers the percent.`;
  }
  const sizeNote =
    context?.accountUsd != null && context.accountUsd > 0
      ? baseTicketSentence(
          bookBounds({
            trades,
            rules: context.rules,
            accountUsd: context.accountUsd,
            cashUsd: context.cashUsd,
          }),
        )
      : "";
  const notes = new Map<string, string>();
  day.forEach((trade, index) => {
    const note = breaks[index]?.note;
    if (note) notes.set(trade.id, note);
  });

  const wins = [...day].filter((trade) => trade.pnlUsd > 0).sort(byBest);
  const losses = [...day].filter((trade) => trade.pnlUsd < 0).sort(byWorst);
  return {
    dayKey,
    label,
    tradeCount: day.length,
    pnlUsd,
    best: wins.slice(0, 3).map((trade) => fillOf(trade, trades, notes.get(trade.id))),
    worst: losses.slice(0, 3).map((trade) => fillOf(trade, trades, notes.get(trade.id))),
    noWinningTrade: wins.length === 0,
    leastBad: wins.length === 0 ? leastBadClose(losses, trades, notes) : null,
    biases: biases.map(publish),
    rational,
    tendency: tendency ? asTendency(tendency) : null,
    lead,
    score,
    why,
    sizeNote,
  };
}

/**
 * The percent above is unchanged when no base rule broke.
 * A broken stop, an oversized ticket, or a close past the daily trade cap then comes off
 * that percent, including on a green day. Trades 1 through the cap stay inside it.
 * This only lowers the score. A red day is already under 100 before this runs.
 */
function applyBaseRuleScore(score: number, broken: number, total: number): number {
  if (broken <= 0 || total <= 0) return score;
  const share = broken / total;
  let next = score - Math.round(8 + 40 * share);
  if (next >= 100) next = 99;
  if (next < 1) next = 1;
  return next;
}

/**
 * Coin narratives are the lightest input to the day percent.
 * Heavier, and already in `score`: the biases and fallacies on the fills, a broken
 * base rule, then the end-of-day realized PnL (a red close takes 1–9 points).
 * This nudge is at most 3 points either way. A plain coin on this scale lands near 4,
 * so a day of ordinary stories does not move. A day of 10s adds up to 3. A day of 1s
 * takes 1 off. One strong coin cannot carry the average.
 * A percent that biases, a red close, or a broken rule already held under 100 stays under 100.
 */
export function narrativeNudge(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const raw = Math.round((mean - 4) * 0.5);
  return Math.max(-3, Math.min(3, raw));
}

function applyNarrativeNudge(score: number, scores: readonly number[]): number {
  let next = score + narrativeNudge(scores);
  if (next > 100) next = 100;
  if (next < 1) next = 1;
  if (score < 100 && next > 99) next = 99;
  return next;
}

/**
 * A full mark is a close that sized up after a loss, faded after the entry, or re-entered a red coin.
 * Averaging down, or a ticket at least 1.5× this trader's own median size, counts half.
 * When revenge sizing, a post-entry fade, or re-entry repeats (the same cluster bar as the habit feed),
 * that pattern's share is lifted so a run of them cannot hide behind a pile of small tickets.
 */
function behaviorWeight(marks: number[], clusters: { active: boolean; share: number }[]): number {
  const mean = marks.reduce((sum, mark) => sum + mark, 0) / marks.length;
  const strong = clusters.filter((cluster) => cluster.active);
  if (strong.length === 0) return mean;
  const worst = Math.max(...strong.map((cluster) => cluster.share));
  const lifted = Math.min(1, worst + 0.25 + 0.1 * (strong.length - 1));
  return Math.max(mean, lifted);
}

/**
 * 100% means the day was not negative, every close avoided the costly patterns, and no active rule was broken.
 * The percent is not a 1–10 score times ten. It follows which fills were costly and how many
 * dollars those fills lost. The coin scores are applied later, in applyNarrativeNudge, and
 * they move this by at most 3 points.
 * A named bias, or a repeated pattern on a day that still closed green, takes a wide slice:
 * the share of the day, then the dollars those fills lost. That slice is larger than the red-close deduction.
 * On a red day, marks that never cleared the bias bar take only a few points, so a small loss with no
 * named bias stays in the 90s.
 * One costly fill cannot round back up to 100%. A negative close cannot be 100% either.
 */
function toScore(input: {
  weight: number;
  namedBias: boolean;
  cluster: boolean;
  pnlUsd: number;
  turnoverUsd: number;
  patternLoss: number;
}): number {
  const { weight, namedBias, cluster, pnlUsd, turnoverUsd, patternLoss } = input;
  let score = 100;
  if (namedBias) {
    // The name costs more than a red close. The dollars those fills lost then open the gap
    // between a small fade and a day of revenge sizing.
    score -= 20 * weight;
    if (patternLoss > 0) score -= 22 * Math.log10(Math.max(patternLoss, 1));
    score -= 10;
  } else if (cluster && pnlUsd >= 0) {
    // A repeated pattern on a green day is still the behavior. It cannot read as a clean day.
    score -= 70 * weight;
  } else if (weight > 0) {
    const share = 2 * weight;
    const dollars = patternLoss > 0 ? Math.log10(1 + patternLoss) : 0;
    score -= Math.min(4, share + dollars);
  }
  score = Math.round(score);
  if (weight > 0 && score >= 100) score = 99;
  if (pnlUsd < 0) {
    score -= redDeduction(-pnlUsd, turnoverUsd);
    if (score > 99) score = 99;
  }
  if (score > 100) score = 100;
  if (score < 1) score = 1;
  return score;
}

function redDeduction(lossUsd: number, turnoverUsd: number): number {
  const byDollars = 2.4 * Math.log10(Math.max(lossUsd, 1));
  const giveback = turnoverUsd > 0 ? Math.min(1, lossUsd / turnoverUsd) : 1;
  const raw = 1 + byDollars + 4 * giveback;
  return Math.min(9, Math.max(1, Math.round(raw)));
}

function whyForScore(why: string, pnlUsd: number, namedBias: boolean): string {
  if (pnlUsd < 0 && !namedBias && !why.startsWith("The score reads")) {
    return `${why} The red close keeps the percent under 100.`;
  }
  return why;
}

function biasFindings(input: {
  revengeTrades: RoundTrip[];
  flat: RoundTrip[];
  day: RoundTrip[];
  fomoTrades: RoundTrip[];
  under: RoundTrip[];
  known: RoundTrip[];
  reentryTrades: RoundTrip[];
  down: RoundTrip[];
  once: RoundTrip[];
  aboveUsual: RoundTrip[];
  usual: number;
  usualLabel: string;
}): Built[] {
  const out: Built[] = [];
  const { revengeTrades, flat, day, fomoTrades, reentryTrades, down, once, aboveUsual, usual, usualLabel } = input;
  if (worth("negative", revengeTrades, flat.length >= 3 ? flat : others(day, revengeTrades))) {
    const usualBit = usualLabel
      ? `, within 30 minutes of a loss that was about your usual ${usualLabel}, to at least 1.5× that size and at least 1.5× the losing trade`
      : " within 30 minutes";
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
  // FOMO only when volume started dropping after the fill and market cap dropped too. Any market cap. A missing read is not FOMO.
  if (worth("negative", fomoTrades, others(day, fomoTrades))) {
    out.push(
      built(
        "fomo",
        "FOMO",
        "FOMO",
        `${noun(fomoTrades.length, "entry", "entries")} bought in as volume started dropping and market cap dropped, and those dropped ${money(fomoTrades)}${including(fomoTrades, true)}`,
        fomoTrades,
      ),
    );
  }
  if (reentryQualifies(reentryTrades)) {
    out.push(
      built(
        "reentry",
        "Break-even chase",
        "a break-even chase",
        `${noun(reentryTrades.length, "later close", "later closes")} were the same coin after a red close, and those dropped ${money(reentryTrades)}${including(reentryTrades, true)}`,
        reentryTrades,
      ),
    );
  }
  if (worth("negative", down, once)) {
    out.push(
      built(
        "adds",
        "Averaging down",
        "averaging down",
        `${noun(down.length, "trade", "trades")} bought more after the coin was already down, and those dropped ${money(down)}${including(down, true)}`,
        down,
      ),
    );
  }
  if (usual > 0 && worth("negative", aboveUsual, others(day, aboveUsual))) {
    const multiple = sizeMultiple(median(aboveUsual.map((trade) => trade.amountUsd)), usual);
    const usualBit = usualLabel ? `your usual ${usualLabel}` : "your usual trade";
    out.push(
      built(
        "size-above-usual",
        "The trade was well above your usual size",
        "a trade well above your usual size",
        `${noun(aboveUsual.length, "trade", "trades")} were at least 1.5× ${usualBit}. The median of those was ${multiple} that size, and those dropped ${money(aboveUsual)}${including(aboveUsual, true)}`,
        aboveUsual,
      ),
    );
  }
  return out.sort(byImpact);
}

function paidTendency(input: {
  flat: RoundTrip[];
  revengeTrades: RoundTrip[];
  day: RoundTrip[];
  fomoTrades: RoundTrip[];
  under: RoundTrip[];
  known: RoundTrip[];
  once: RoundTrip[];
  multi: RoundTrip[];
  usualLabel: string;
}): Built | null {
  const { flat, revengeTrades, day, fomoTrades, under, known, once, multi, usualLabel } = input;
  const out: Built[] = [];
  if (worth("positive", flat, revengeTrades.length >= 3 ? revengeTrades : others(day, flat))) {
    const usualBit = usualLabel ? `your usual ${usualLabel}` : "your usual size";
    out.push(
      built(
        "size-flat-after-loss",
        "Kept the size the same after a loss",
        "keeping the size the same after a loss",
        `${noun(flat.length, "next trade", "next trades")} stayed at or under ${usualBit}, and those made ${gained(flat)}${including(flat, false)}`,
        flat,
      ),
    );
  }
  const fomoRest = others(day, fomoTrades);
  if (worth("positive", fomoTrades, fomoRest)) {
    out.push(
      built(
        "fomo-paid",
        "Got paid after volume faded",
        "getting paid after volume faded",
        `${noun(fomoTrades.length, "entry", "entries")} bought in as volume started dropping and market cap dropped, and those made ${gained(fomoTrades)}${including(fomoTrades, false)}`,
        fomoTrades,
      ),
    );
  }
  if (worth("positive", under, others(known, under))) {
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
        "One trade per coin",
        "one trade per coin",
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
  fomoTrades: RoundTrip[];
  reentryTrades: RoundTrip[];
  pnlUsd: number;
}): string {
  const { rational, primary, biases, tendency, usualLabel, counts, revengeTrades, fomoTrades, reentryTrades, pnlUsd } = input;
  if (biases.length > 0) {
    return biases
      .map((bias, index) =>
        index === 0
          ? bias.id === "reentry"
            ? `The pattern in the closes was ${bias.phrase}: ${bias.body}.`
            : `The dominant bias was ${bias.phrase}: ${bias.body}.`
          : `${bias.title}: ${bias.body}.`,
      )
      .join(" ");
  }
  if (rational && tendency) return `You traded more rationally that day. ${asTendency(tendency).sentence}`;
  if (rational) {
    const detail = rationalDetail(counts, usualLabel);
    return detail ? `You traded more rationally that day. ${detail}` : "You traded more rationally that day.";
  }
  const behavior = behaviorLead(revengeTrades, fomoTrades, reentryTrades);
  if (primary && behavior) return behavior;
  if (tendency) return asTendency(tendency).sentence;
  if (pnlUsd < 0) {
    const detail = rationalDetail(counts, usualLabel);
    if (counts.n > 0 && counts.small === counts.n) {
      return detail ? `The trades stayed small. ${detail}` : "The trades stayed small.";
    }
    if (detail) return detail;
  }
  return behavior || "The closes do not settle on one bias.";
}

function rationalDetail(counts: Counts, usualLabel: string): string {
  const parts: string[] = [];
  if (counts.n > 0 && counts.small === counts.n && usualLabel) parts.push(`every close stayed at or under your usual ${usualLabel}`);
  if (counts.revenge === 0) parts.push("nothing sized up after a loss");
  if (counts.fomo === 0 && counts.fomoUnknown === 0) parts.push("no close faded after the entry");
  if (parts.length === 0) return "";
  return capitalize(joinAnd(parts)) + ".";
}

function behaviorLead(revengeTrades: RoundTrip[], fomoTrades: RoundTrip[], reentryTrades: RoundTrip[]): string {
  const parts: string[] = [];
  if (revengeTrades.length > 0) {
    parts.push(
      `you sized up after a loss on ${noun(revengeTrades.length, "close", "closes")}, and those ${resultWord(revengeTrades)} ${money(revengeTrades)}`,
    );
  }
  if (fomoTrades.length > 0) {
    parts.push(
      `${noun(fomoTrades.length, "entry", "entries")} bought in as volume started dropping and market cap dropped, and those ${resultWord(fomoTrades)} ${money(fomoTrades)}`,
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

function whyLine(counts: Counts, fomoInScore: boolean): string {
  const primary: string[] = [];
  if (counts.revenge >= 2) primary.push("sizing up after a loss");
  else if (counts.revenge === 1) primary.push("a size-up after a loss");
  if (fomoInScore && counts.fomo >= 2) primary.push("volume and market cap dropping after the entry");
  else if (fomoInScore && counts.fomo === 1) primary.push("volume and market cap dropping after one entry");
  if (counts.reentry >= 2) primary.push("re-entering losers");
  else if (counts.reentry === 1) primary.push("a re-entry after a red close");
  if (primary.length > 0) return `The score reads ${joinAnd(primary)} in this day's closes.`;

  if (counts.adds === 0 && counts.aboveUsual === 0) return cleanWhy(counts);

  const slips: string[] = [];
  if (counts.adds === 1) slips.push("one coin was averaged down");
  else if (counts.adds > 1) slips.push(`${counts.adds} coins were averaged down`);
  if (counts.aboveUsual === 1) slips.push("one trade was at least 1.5× your usual size");
  else if (counts.aboveUsual > 1) slips.push(`${counts.aboveUsual} trades were at least 1.5× your usual size`);
  const rest: string[] = [];
  if (counts.n > 0 && counts.small === counts.n) rest.push("the other closes stayed small");
  if (counts.revenge === 0) rest.push("nothing sized up after a loss");
  if (counts.fomo === 0 && counts.fomoUnknown === 0) rest.push("nothing faded after the entry");
  if (rest.length === 0) return `${capitalize(joinAnd(slips))}.`;
  return `${capitalize(joinAnd(slips))}, while ${joinAnd(rest)}.`;
}

function cleanWhy(counts: Counts): string {
  const details: string[] = [];
  if (counts.n > 0 && counts.small === counts.n) details.push("the trades stayed small");
  if (counts.revenge === 0) details.push("nothing sized up after a loss");
  if (counts.fomo > 0) {
    details.push(
      `${counts.fomo} ${counts.fomo === 1 ? "trade faded after the entry" : "trades faded after the entry"}`,
    );
  } else if (counts.athKnown > 0 && counts.under === counts.athKnown) details.push("entries stayed at or under 45% of the high");
  else if (counts.fomoUnknown === 0) details.push("no trade faded after the entry");
  if (details.length === 0) return "The trades did not repeat a costly pattern.";
  if (counts.fomo > 0) return `${capitalize(joinAnd(details))}.`;
  return `The trades did not repeat a costly pattern: ${joinAnd(details)}.`;
}

function leastBadClose(losses: RoundTrip[], book: RoundTrip[], notes?: Map<string, string>): DayFill | null {
  if (losses.length < 2) return null;
  const worst = losses[0];
  const least = losses[losses.length - 1];
  if (!(least.pnlUsd < 0) || !(worst.pnlUsd < 0)) return null;
  if (Math.abs(worst.pnlUsd) + 1e-9 < Math.abs(least.pnlUsd) * 2) return null;
  return fillOf(least, book, notes?.get(least.id));
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
  const lostExits = new Map<string, number[]>();
  const again = new Set<string>();
  for (const trade of ordered) {
    const entry = Date.parse(trade.entryAt);
    const exits = lostExits.get(trade.mint) ?? [];
    if (Number.isFinite(entry) && exits.some((exit) => exit <= entry)) again.add(trade.id);
    if (trade.pnlUsd < 0) {
      const exit = Date.parse(trade.exitAt);
      if (Number.isFinite(exit)) {
        exits.push(exit);
        lostExits.set(trade.mint, exits);
      }
    }
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

function fillOf(trade: RoundTrip, book: RoundTrip[], note?: string): DayFill {
  const narrative = narrativeScore(trade, book);
  const fill: DayFill = {
    id: trade.id,
    symbol: trade.symbol,
    pnlUsd: trade.pnlUsd,
    amountUsd: trade.amountUsd,
    narrativeScore: narrative.score,
    narrative: narrative.line,
  };
  if (note) fill.note = note;
  return fill;
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
