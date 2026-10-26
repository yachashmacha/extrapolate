import { fmtHold, fmtMc, fmtPct, fmtRate, fmtUsd, fmtUsdPlain } from "@/lib/format";
import { kolLabel } from "@/lib/kols";
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
  if (size) candidates.push(sizeCandidate(size, desk));
  const callers = callerCandidate(trades, early, quiet, desk, mc);
  if (callers) candidates.push(callers);
  candidates.push(...narrativeCandidates(trades, desk, mc));
  const behavior = behaviorCandidate(trades, overnight, day, revenge, size);
  if (behavior) candidates.push(behavior);

  return pickFixes(candidates).map(toCard("fix"));
}

export function buildKeeps(trades: RoundTrip[], _terminal: TerminalId): PlayCard[] {
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
      rule: `In this book, the winners clustered near ${fmtMc(medianMc)} market cap and under ${fmtMc(mc.cut)}.`,
      steps: [
        `The paying range in this book is under ${fmtMc(mc.cut)}. That line is this book's.`,
        "When a coin leaves that range, the comparison above is what this book shows. The paying entries were the smaller ones.",
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
      rule: `In this book, the winning tickets sat near ${fmtUsdPlain(medianSize)}. That is the size they actually used.`,
      steps: [
        `The preset that matches those tickets is ${fmtUsdPlain(medianSize)}.`,
        "A stronger setup in this book did not get a larger ticket. Size stayed put.",
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
          ? `In this book, the trades where ${joinOr(names)} was already in the coin finished green, at the base size. That order is not a confirmation, and it does not change the size.`
          : "In this book, trades with a tagged wallet already in finished green, at the base size. That order is not a confirmation, and it does not change the size.",
      steps: [
        "Tag the wallet on the fill the same day, with the timing: before you, with you, or after you.",
        "A wallet already in is a sequence this book can count. It does not confirm the trade, and it does not change the size.",
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
    rule: `In this book, entries at or above ${fmtMc(mc.cut)} market cap lost. The tickets that paid sat near ${fmtUsdPlain(winnerSize)}, under that cap.`,
    steps: [
      `On ${desk}, the losing band in this book starts at ${fmtMc(mc.cut)}. Read the market cap before the buy click.`,
      `The paying tickets sat near ${fmtUsdPlain(winnerSize)}. A higher market cap does not earn a larger ticket.`,
      "After ten sessions, open this desk again. The line is this book's, and it stays only while that upper band is still red.",
    ],
    trades: mc.bad,
    damage: mc.damage,
  };
}

function sizeCandidate(size: Split, desk: string): Candidate {
  const base = median(size.good.map((trade) => trade.amountUsd));
  return {
    id: "fix-size",
    category: "size",
    title: `Preset the ticket at ${fmtUsdPlain(base)}`,
    shortLabel: `Ticket over ${fmtUsdPlain(size.cut)}`,
    evidence: `${portrait(size.bad, `Tickets of ${fmtUsdPlain(size.cut)} and up`)} ${portrait(size.good, `Tickets under ${fmtUsdPlain(size.cut)}`)}`,
    rule: `In this book, the tickets that paid sat near ${fmtUsdPlain(base)}. Tickets at ${fmtUsdPlain(size.cut)} or above are the ones that lost.`,
    steps: [
      `On ${desk}, the preset that matches the paying tickets in this book is ${fmtUsdPlain(base)}.`,
      "The same preset on the next trade after a win keeps the size. A good read does not raise it.",
      "After ten sessions, compare the preset with the new median winner in this book. Move it only if the winners moved.",
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
    title: names.length > 0 ? `In this book, ${joinOr(names)} was in before the winners` : "In this book, a tracked wallet was in before the winners",
    shortLabel: "No early wallet",
    evidence: `${portrait(quiet, "Trades with no tracked wallet in before you")}${late} ${portrait(early, "Trades with a tracked wallet already in")}`,
    rule: `In this book, trades with ${joinOr(names.length > 0 ? names : [who])} already in finished ahead of trades with nobody in before the entry. The buy still has to sit under ${cap} at the base size. A tracked wallet is not a confirmation.`,
    steps: [
      `The desk checks the tracked wallets on each coin and shows the name. Add anyone still missing from a ${desk} fill on the tape, with the timing.`,
      `A wallet that posts after the fill is a later print. It does not confirm the entry, and it is not a reason to add.`,
      "Re-read the table after two weeks. The names that still sit on the green side are this book's record.",
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
        rule: `In this book, ${label} was green under ${fmtMc(split.cut)} market cap, at the base size. Above that, it was red. A tracked wallet does not move that line or the size.`,
        steps: [
          `When the narrative is ${label.toLowerCase()}, the market-cap check comes before the ticker. ${fmtMc(split.cut)} is the line on this book.`,
          `On ${desk}, this book's line for ${label.toLowerCase()} is ${fmtMc(split.cut)}. A loud timeline does not move it.`,
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
        rule: `${label} lost in this book. A later look, if any, stays at half the base size and under ${mc ? fmtMc(mc.cut) : "the market-cap line in this book"}. A tracked wallet does not raise that size.`,
        steps: [
          `${label} is a narrative this book already lost. Extended means the coin is already up the range this book measured.`,
          "A later ticket, if any, stays at half the base size. This book does not show a full-size ticket working there.",
          "If the next ten in this book are still red, the comparison stands.",
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
  size: Split | null,
): Candidate | null {
  const options: Candidate[] = [];
  if (overnight.length >= 4 && day.length >= 4 && net(overnight) < 0 && winRate(day) >= winRate(overnight) + 0.15) {
    const holdNote = holdSentence(trades);
    options.push({
      id: "fix-overnight",
      category: "behavior",
      title: "Overnight lost in this book",
      shortLabel: "Overnight",
      evidence: `${portrait(overnight, "Overnight entries, 10pm–6am ET")} ${portrait(day, "Entries from 6am–10pm ET")}`,
      rule: "In this book, entries from 10pm to 6am ET lost against the daytime entries. The split is this book's.",
      steps: [
        "The overnight entries in this book are the ones that lost. A coin still open in the morning can be judged against the market-cap line.",
        holdNote ?? "In this book, the daytime entries are the ones that paid. An overnight print is not a separate edge.",
        revenge.length >= 4 && net(revenge) < 0
          ? `After a red close, the next ticket in this book that paid stayed near ${fmtUsdPlain(size ? median(size.good.map((trade) => trade.amountUsd)) : median(day.map((trade) => trade.amountUsd)))}. A larger ticket is not what those closes show.`
          : "After a red close, the next ticket stays on the same preset. This book does not show a larger ticket working there.",
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
      evidence: portrait(revenge, "The next ticket within 30 minutes of a loss that was about your usual size, when it was at least 1.5× your median and at least 1.5× that losing ticket"),
      rule: `After a red close, the next ticket that paid in this book sat near ${fmtUsdPlain(base)}. A larger ticket is not what those closes show.`,
      steps: [
        `When a trade closes red, the preset that matches this book is ${fmtUsdPlain(base)} until the next green close.`,
        "The size stays there. This book does not show a larger ticket working after that red close.",
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
      rule: `In this book, ${label.toLowerCase()} finished green. Median entry in this set was ${fmtMc(median(subset.map((trade) => trade.entryMarketCapUsd)))}. A tracked wallet does not raise the size.`,
      steps: [
        `A ${label.toLowerCase()} coin inside that entry range is what this book already shows.`,
        "The narrative is a tag on the coin. It is not a reason to raise size.",
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
  return `In this book, holds of ${good.label} went ${record(good.trades)}. Holds ${bad.label} went ${record(bad.trades)}. That is this book's record, not a hold to copy.`;
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
      const row = scores.get(kol.id) ?? { name: kolLabel(kol), trades: [] };
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
      const row = scores.get(kol.id) ?? { name: kolLabel(kol), trades: [] };
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
