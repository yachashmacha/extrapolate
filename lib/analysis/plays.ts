import { fmtHold, fmtMc, fmtPct, fmtRate, fmtUsd, fmtUsdPlain } from "@/lib/format";
import { META_LABEL } from "@/lib/metas";
import { terminalName } from "@/lib/terminals";
import type { MetaId, PlayCard, RoundTrip, TerminalId } from "@/lib/types";
import { average, median, net, winRate } from "@/lib/analysis/stats";
import {
  bestSplit,
  kolMode,
  MC_CUTS,
  revengeIds,
  sessionName,
  SIZE_CUTS,
  type Split,
} from "@/lib/analysis/slices";

interface Candidate {
  id: string;
  category: PlayCard["category"];
  title: string;
  shortLabel: string;
  evidence: string;
  rule: string;
  steps: string[];
  trades: RoundTrip[];
  damage: number;
}

export function buildFixes(trades: RoundTrip[], terminal: TerminalId): PlayCard[] {
  const desk = terminalName(terminal);
  const candidates: Candidate[] = [];
  const mc = bestSplit(trades, (trade) => trade.entryMarketCapUsd, MC_CUTS);
  const size = bestSplit(trades, (trade) => trade.amountUsd, SIZE_CUTS);
  const early = trades.filter((trade) => kolMode(trade) === "early");
  const quiet = trades.filter((trade) => kolMode(trade) !== "early");
  const revenge = trades.filter((trade) => revengeIds(trades).has(trade.id));
  const overnight = trades.filter((trade) => sessionName(trade) === "Overnight");
  const day = trades.filter((trade) => sessionName(trade) !== "Overnight");

  if (mc) candidates.push(entryCandidate(mc, desk, size));
  if (size) candidates.push(sizeCandidate(size, desk, trades));
  const callers = callerCandidate(trades, early, quiet, desk, mc);
  if (callers) candidates.push(callers);
  candidates.push(...narrativeCandidates(trades, desk, mc));
  const behavior = behaviorCandidate(trades, overnight, day, revenge, desk, size);
  if (behavior) candidates.push(behavior);

  return pickFixes(candidates).map(toCard("fix"));
}

export function buildKeeps(trades: RoundTrip[], terminal: TerminalId): PlayCard[] {
  const desk = terminalName(terminal);
  const keeps: Candidate[] = [];
  const mc = bestSplit(trades, (trade) => trade.entryMarketCapUsd, MC_CUTS);
  const size = bestSplit(trades, (trade) => trade.amountUsd, SIZE_CUTS);
  const early = trades.filter((trade) => kolMode(trade) === "early");

  if (mc && winRate(mc.good) >= 0.5) {
    const medianMc = median(mc.good.map((trade) => trade.entryMarketCapUsd));
    keeps.push({
      id: "keep-entry",
      category: "entry",
      title: "The entry range that paid",
      shortLabel: `Under ${fmtMc(mc.cut)}`,
      evidence: portrait(mc.good, `Entries under ${fmtMc(mc.cut)} market cap`),
      rule: `Keep hunting where the winners already cluster, near ${fmtMc(medianMc)} market cap and under ${fmtMc(mc.cut)}.`,
      steps: [
        `Before a new session on ${desk}, write “under ${fmtMc(mc.cut)}” on the ticket. That is the range this book got paid in.`,
        `When a coin leaves that range, let the fix rule decide. The winning habit is the small entry, repeated.`,
      ],
      trades: mc.good,
      damage: net(mc.good),
    });
  }

  if (size && winRate(size.good) >= 0.5) {
    const medianSize = median(size.good.map((trade) => trade.amountUsd));
    keeps.push({
      id: "keep-size",
      category: "size",
      title: "The ticket size that paid",
      shortLabel: `About ${fmtUsdPlain(medianSize)}`,
      evidence: portrait(size.good, `Tickets under ${fmtUsdPlain(size.cut)}`),
      rule: `Save ${fmtUsdPlain(medianSize)} as the preset. That is the size the winning tickets actually used.`,
      steps: [
        `On ${desk}, set the default buy to ${fmtUsdPlain(medianSize)} and name the preset “base”.`,
        `A stronger setup gets the same preset. Size stays put when the read is good.`,
      ],
      trades: size.good,
      damage: net(size.good),
    });
  }

  if (early.length >= 4 && net(early) > 0 && winRate(early) >= 0.55) {
    const names = topEarlyNames(early);
    keeps.push({
      id: "keep-callers",
      category: "callers",
      title: names.length > 0 ? `${joinAnd(names)} were already in` : "Early KOLs were in the winners",
      shortLabel: "Early KOL",
      evidence: portrait(early, "Trades with a KOL already in"),
      rule:
        names.length > 0
          ? `Keep taking the trades where ${joinOr(names)} is already in the coin, at the base size.`
          : "Keep taking the trades where a tagged KOL was already in, at the base size.",
      steps: [
        "Tag the KOL on the fill the same day, with the timing: before you, with you, or after you.",
        "A KOL who is already in can confirm a trade that also passes the market-cap and size rules.",
      ],
      trades: early,
      damage: net(early),
    });
  }

  const bestMeta = bestMetaKeep(trades);
  if (bestMeta) keeps.push(bestMeta);

  return keeps.slice(0, 4).map(toCard("keep"));
}

export function buildChecklist(fixes: PlayCard[], keeps: PlayCard[]): string[] {
  const lines = fixes.map((fix) => fix.rule);
  const keep = keeps[0];
  if (keep) lines.push(keep.rule);
  return lines.slice(0, 6);
}

function entryCandidate(mc: Split, desk: string, size: Split | null): Candidate {
  const winnerSize = size ? median(size.good.map((trade) => trade.amountUsd)) : median(mc.good.map((trade) => trade.amountUsd));
  return {
    id: "fix-entry",
    category: "entry",
    title: `Cap new buys at ${fmtMc(mc.cut)}`,
    shortLabel: `Above ${fmtMc(mc.cut)}`,
    evidence: `${portrait(mc.bad, `Entries at ${fmtMc(mc.cut)} market cap and above`)} ${portrait(mc.good, `Entries under ${fmtMc(mc.cut)}`)}`,
    rule: `A new buy at or above ${fmtMc(mc.cut)} market cap is a pass. The ticket that paid in this book sat near ${fmtUsdPlain(winnerSize)}, under that cap.`,
    steps: [
      `On ${desk}, read the market cap out loud before the buy click. At ${fmtMc(mc.cut)} or above, close the ticket.`,
      `Leave the buy preset at ${fmtUsdPlain(winnerSize)}. A higher market cap does not earn a larger ticket.`,
      "After ten sessions, open this desk again. Keep the cap while the upper band is still red.",
    ],
    trades: mc.bad,
    damage: mc.damage,
  };
}

function sizeCandidate(size: Split, desk: string, trades: RoundTrip[]): Candidate {
  const base = median(size.good.map((trade) => trade.amountUsd));
  const heavy = trades.filter((trade) => trade.liquidityUsd > 0 && trade.amountUsd / trade.liquidityUsd >= 0.015);
  const poolNote =
    heavy.length >= 3 && net(heavy) < 0
      ? ` ${heavy.length} tickets were also at least 1.5% of the pool, and those came to ${fmtUsd(net(heavy))}.`
      : "";
  return {
    id: "fix-size",
    category: "size",
    title: `Preset the ticket at ${fmtUsdPlain(base)}`,
    shortLabel: `Ticket over ${fmtUsdPlain(size.cut)}`,
    evidence: `${portrait(size.bad, `Tickets of ${fmtUsdPlain(size.cut)} and up`)} ${portrait(size.good, `Tickets under ${fmtUsdPlain(size.cut)}`)}${poolNote}`,
    rule: `The working ticket is ${fmtUsdPlain(base)}. Anything at ${fmtUsdPlain(size.cut)} or above is retired until the next review.`,
    steps: [
      `On ${desk}, set one buy preset to ${fmtUsdPlain(base)} and delete the larger keys for the next ten sessions.`,
      heavy.length >= 3
        ? "If the ticket would be more than 1.5% of the pool, cut it until it is under that. On a $20k pool that is a $300 cap."
        : "Use the same preset on the next trade after a win. A good read keeps the size, it does not raise it.",
      "After ten sessions, compare the preset with the new median winner. Move it only if the winners moved.",
    ],
    trades: size.bad,
    damage: size.damage,
  };
}

function callerCandidate(
  trades: RoundTrip[],
  early: RoundTrip[],
  quiet: RoundTrip[],
  desk: string,
  mc: Split | null,
): Candidate | null {
  if (early.length < 4 || quiet.length < 4) return null;
  if (net(early) <= 0 || net(quiet) >= 0) return null;
  if (winRate(early) < winRate(quiet) + 0.12) return null;
  const names = topEarlyNames(early);
  const lateNames = lateNamesFrom(trades);
  const cap = mc ? fmtMc(mc.cut) : "your market-cap cap";
  const who = names.length > 0 ? names.join(" or ") : "one tagged KOL";
    const late =
    lateNames.length > 0
      ? ` ${joinAnd(lateNames)} showed up after entries that lost. A late post is not a reason to stay in or to add.`
      : "";
  return {
    id: "fix-callers",
    category: "callers",
    title: names.length > 0 ? `Need ${joinOr(names)} already in` : "Need an early KOL in the trade",
    shortLabel: "No early KOL",
    evidence: `${portrait(quiet, "Trades with no KOL in before you")}${late} ${portrait(early, "Trades with a KOL already in")}`,
    rule: `A buy needs ${joinOr(names.length > 0 ? names : [who])} already in the coin, and it still has to sit under ${cap} at the base size.`,
    steps: [
      `On the tape, tag who was in the coin and whether they were before you, with you, or after you. ${desk} will not do this for you.`,
      `If ${joinOr(names.length > 0 ? names : [who])} is absent, pass. A KOL who posts after your fill is a mark on the chart, not a confirmation.`,
      "Re-read the KOL table after two weeks of tags. Keep the names that still sit on the green side.",
    ],
    trades: quiet,
    damage: -net(quiet),
  };
}

function narrativeCandidates(trades: RoundTrip[], desk: string, mc: Split | null): Candidate[] {
  const interactions: Candidate[] = [];
  const blunts: Candidate[] = [];
  const metas = new Set<MetaId>();
  for (const trade of trades) for (const meta of trade.metas) metas.add(meta);

  for (const meta of metas) {
    const subset = trades.filter((trade) => trade.metas.includes(meta));
    const split = bestSplit(subset, (trade) => trade.entryMarketCapUsd, MC_CUTS, 3);
    if (split && subset.length >= 6) {
      const label = META_LABEL[meta];
      interactions.push({
        id: `fix-meta-${meta}`,
        category: "narrative",
        title: `${label} only under ${fmtMc(split.cut)}`,
        shortLabel: `${label} above ${fmtMc(split.cut)}`,
        evidence: `${portrait(split.bad, `${label} at ${fmtMc(split.cut)} and above`)} ${portrait(split.good, `${label} under ${fmtMc(split.cut)}`)}`,
        rule: `${label} is tradable under ${fmtMc(split.cut)} market cap, at the base size, with an early KOL. Above that, ${label.toLowerCase()} is a pass.`,
        steps: [
          `When the narrative is ${label.toLowerCase()}, the market-cap check comes before the ticker. ${fmtMc(split.cut)} is the line on this book.`,
          `On ${desk}, a ${label.toLowerCase()} coin above the line gets closed, even when the timeline is loud.`,
        ],
        trades: split.bad,
        damage: split.damage,
      });
      continue;
    }
    if (subset.length >= 4 && net(subset) < 0 && winRate(subset) <= 0.4) {
      const label = META_LABEL[meta];
      blunts.push({
        id: `fix-meta-${meta}`,
        category: "narrative",
        title: `${label} is a leak in this book`,
        shortLabel: label,
        evidence: portrait(subset, label),
        rule: `${label} goes to half size for the next ten sessions, and only under ${mc ? fmtMc(mc.cut) : "the market-cap cap"} with an early KOL. Otherwise it is a pass.`,
        steps: [
          `Say the narrative out loud before the buy. If it is ${label.toLowerCase()} and the coin is already extended, pass.`,
          "One exception per session is the maximum, at half the base ticket.",
          "If the next ten are still red, this narrative leaves the menu.",
        ],
        trades: subset,
        damage: -net(subset),
      });
    }
  }

  interactions.sort((a, b) => b.damage - a.damage);
  blunts.sort((a, b) => b.damage - a.damage);
  const chosen: Candidate[] = [];
  if (interactions[0]) {
    const extra = interactions[1];
    const primary = interactions[0];
    if (extra && extra.damage >= 400) {
      primary.evidence = `${primary.evidence} Same split on the next narrative. ${extra.evidence}`;
      primary.steps = [...primary.steps, `${extra.title}. Use that line the same way.`];
    }
    chosen.push(primary);
  }
  for (const blunt of blunts) {
    if (chosen.length >= 2) break;
    const overlap = jaccard(
      blunt.trades.map((trade) => trade.id),
      chosen.flatMap((card) => card.trades.map((trade) => trade.id)),
    );
    if (overlap < 0.5 && blunt.damage >= 400) chosen.push(blunt);
  }
  return chosen;
}

function behaviorCandidate(
  trades: RoundTrip[],
  overnight: RoundTrip[],
  day: RoundTrip[],
  revenge: RoundTrip[],
  desk: string,
  size: Split | null,
): Candidate | null {
  const options: Candidate[] = [];
  if (overnight.length >= 4 && day.length >= 4 && net(overnight) < 0 && winRate(day) >= winRate(overnight) + 0.15) {
    const holdNote = holdSentence(trades);
    options.push({
      id: "fix-overnight",
      category: "behavior",
      title: "Flat from 10pm to 6am ET",
      shortLabel: "Overnight",
      evidence: `${portrait(overnight, "Overnight entries, 10pm–6am ET")} ${portrait(day, "Entries from 6am–10pm ET")}`,
      rule: "The session ends at 10pm ET. The next one starts at 10am ET, with the base preset loaded.",
      steps: [
        `Close ${desk} at 10pm ET. A coin that is still there in the morning can be judged with the market-cap rule in front of you.`,
        holdNote ?? "A setup that appears after 10pm gets written down and checked at 10am.",
        revenge.length >= 4 && net(revenge) < 0
          ? `After a red close, the next ticket stays at ${fmtUsdPlain(size ? median(size.good.map((trade) => trade.amountUsd)) : median(day.map((trade) => trade.amountUsd)))}. Getting it back is not a larger preset.`
          : "After a red close, take one full minute before the next ticket. Same preset.",
      ],
      trades: overnight,
      damage: -net(overnight),
    });
  }

  if (revenge.length >= 4 && net(revenge) < 0 && winRate(revenge) + 0.15 <= winRate(trades.filter((trade) => !revenge.includes(trade)))) {
    const base = size ? median(size.good.map((trade) => trade.amountUsd)) : median(trades.map((trade) => trade.amountUsd));
    options.push({
      id: "fix-revenge",
      category: "behavior",
      title: "The trade after a loss stays small",
      shortLabel: "Revenge size",
      evidence: portrait(revenge, "The next ticket after a loss, when it was at least 1.35× your median size"),
      rule: `After a red close, the next ticket is ${fmtUsdPlain(base)}. The larger preset stays off.`,
      steps: [
        `When a trade closes red, the only enabled preset on ${desk} is ${fmtUsdPlain(base)} until the next green close.`,
        "If you want the size back, wait for the next session.",
      ],
      trades: revenge,
      damage: -net(revenge),
    });
  }

  options.sort((a, b) => b.damage - a.damage);
  const best = options[0];
  if (!best) return null;
  const second = options[1];
  if (second && second.id !== best.id && !best.steps.some((step) => step.includes("After a red close"))) {
    best.steps = [...best.steps, second.rule];
  }
  return best;
}

function bestMetaKeep(trades: RoundTrip[]): Candidate | null {
  const groups = new Map<MetaId, RoundTrip[]>();
  for (const trade of trades) {
    for (const meta of trade.metas) {
      groups.set(meta, [...(groups.get(meta) ?? []), trade]);
    }
  }
  let best: Candidate | null = null;
  for (const [meta, subset] of groups) {
    if (subset.length < 4 || net(subset) <= 0 || winRate(subset) < 0.55) continue;
    const label = META_LABEL[meta];
    const candidate: Candidate = {
      id: `keep-meta-${meta}`,
      category: "narrative",
      title: `${label} paid`,
      shortLabel: label,
      evidence: portrait(subset, label),
      rule: `Keep ${label.toLowerCase()} on the menu when the market-cap, size, and KOL rules all pass. Median entry in this set was ${fmtMc(median(subset.map((trade) => trade.entryMarketCapUsd)))}.`,
      steps: [
        `A ${label.toLowerCase()} coin inside the entry range is the setup this book already knows how to trade.`,
        "The narrative is permission to look, not permission to raise size.",
      ],
      trades: subset,
      damage: net(subset),
    };
    if (!best || candidate.damage > best.damage) best = candidate;
  }
  return best;
}

function holdSentence(trades: RoundTrip[]): string {
  const bands = [
    { label: "under 3 minutes", trades: trades.filter((trade) => trade.holdMinutes < 3) },
    { label: "3–15 minutes", trades: trades.filter((trade) => trade.holdMinutes >= 3 && trade.holdMinutes < 15) },
    { label: "15–45 minutes", trades: trades.filter((trade) => trade.holdMinutes >= 15 && trade.holdMinutes < 45) },
  ];
  const good = bands.filter((band) => band.trades.length >= 4 && net(band.trades) > 0).sort((a, b) => net(b.trades) - net(a.trades))[0];
  const bad = bands.filter((band) => band.trades.length >= 4 && net(band.trades) < 0).sort((a, b) => net(a.trades) - net(b.trades))[0];
  if (!good || !bad) return "";
  return `Inside the day, holds of ${good.label} went ${record(good.trades)}. Holds ${bad.label} went ${record(bad.trades)}. On an entry that already passed the market-cap rule, make the decision at the start of the window that paid.`;
}

function joinOr(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

function joinAnd(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function topEarlyNames(trades: RoundTrip[]): string[] {
  const scores = new Map<string, { name: string; trades: RoundTrip[] }>();
  for (const trade of trades) {
    for (const kol of trade.kols) {
      if (kol.timing === "after") continue;
      const row = scores.get(kol.id) ?? { name: kol.name, trades: [] };
      row.trades.push(trade);
      scores.set(kol.id, row);
    }
  }
  return [...scores.values()]
    .filter((row) => row.trades.length >= 4 && winRate(row.trades) >= 0.6 && net(row.trades) > 0)
    .sort((a, b) => net(b.trades) - net(a.trades))
    .slice(0, 3)
    .map((row) => row.name);
}

function lateNamesFrom(trades: RoundTrip[]): string[] {
  const scores = new Map<string, { name: string; trades: RoundTrip[] }>();
  for (const trade of trades) {
    for (const kol of trade.kols) {
      if (kol.timing !== "after") continue;
      const row = scores.get(kol.id) ?? { name: kol.name, trades: [] };
      row.trades.push(trade);
      scores.set(kol.id, row);
    }
  }
  return [...scores.values()]
    .filter((row) => row.trades.length >= 3 && winRate(row.trades) <= 0.35 && net(row.trades) < 0)
    .sort((a, b) => net(a.trades) - net(b.trades))
    .slice(0, 2)
    .map((row) => row.name);
}

function jaccard(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const b = new Set(right);
  const intersection = left.filter((id) => b.has(id)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function portrait(trades: RoundTrip[], label: string): string {
  return `${label}: ${record(trades)}, net ${fmtUsd(net(trades))}, median entry ${fmtMc(median(trades.map((trade) => trade.entryMarketCapUsd)))}, median ticket ${fmtUsdPlain(median(trades.map((trade) => trade.amountUsd)))}.`;
}

function record(trades: RoundTrip[]): string {
  const wins = trades.filter((trade) => trade.pnlUsd > 0).length;
  return `${wins} for ${trades.length} (${fmtRate(winRate(trades))}, average ${fmtPct(average(trades.map((trade) => trade.pnlPct)))})`;
}

function pickFixes(candidates: Candidate[]): Candidate[] {
  const categories: PlayCard["category"][] = ["entry", "size", "callers", "narrative", "behavior"];
  const picked: Candidate[] = [];
  for (const category of categories) {
    const rows = candidates.filter((candidate) => candidate.category === category).sort((a, b) => b.damage - a.damage);
    if (category === "narrative") {
      picked.push(...rows.slice(0, 2));
      continue;
    }
    if (rows[0]) picked.push(rows[0]);
  }
  return picked.slice(0, 6);
}

function toCard(tone: PlayCard["tone"]) {
  return (candidate: Candidate): PlayCard => ({
    id: candidate.id,
    category: candidate.category,
    tone,
    title: candidate.title,
    shortLabel: candidate.shortLabel,
    sample: candidate.trades.length,
    winRate: winRate(candidate.trades),
    netPnlUsd: net(candidate.trades),
    damageUsd: candidate.damage,
    evidence: candidate.evidence.trim(),
    rule: candidate.rule,
    steps: candidate.steps,
    tradeIds: candidate.trades.map((trade) => trade.id),
  });
}
