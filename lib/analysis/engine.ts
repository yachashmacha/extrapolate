import { fmtHold, fmtMc, fmtUsd, fmtUsdPlain } from "@/lib/format";
import { kolLabel } from "@/lib/kols";
import { META_LABEL } from "@/lib/metas";
import type {
  Analysis,
  AnnotatedTrade,
  EquityPoint,
  KolReport,
  MetaId,
  MetaReport,
  Pattern,
  RoundTrip,
  SidePortrait,
  Summary,
  TerminalId,
} from "@/lib/types";
import { buildChecklist, buildFixes, buildKeeps } from "@/lib/analysis/plays";
import { holdBand, kolMode, mcBand, revengeIds, sessionName, sizeBand } from "@/lib/analysis/slices";
import { average, lossesOf, median, mode, money, net, sum, winRate, winsOf } from "@/lib/analysis/stats";

export function analyze(trades: RoundTrip[], terminal: TerminalId = trades[0]?.terminal ?? "wallet"): Analysis {
  const ordered = [...trades].sort((a, b) => a.exitAt.localeCompare(b.exitAt));
  const winners = winsOf(ordered);
  const losers = lossesOf(ordered);
  const summary = summarize(ordered);
  const kols = kolReports(ordered);
  const comparison = {
    winners: portrait(winners),
    losers: portrait(losers),
  };
  polishNames(comparison, kols);
  const fixes = buildFixes(ordered, terminal);
  const keeps = buildKeeps(ordered, terminal);
  const revenge = revengeIds(ordered);
  const annotated = ordered.map((trade) => annotate(trade, winners, losers, fixes, revenge));
  const thin = ordered.length < 8;

  return {
    summary,
    lede: thin ? thinLede(ordered.length) : writeLede(comparison, summary),
    comparison,
    patterns: thin ? [] : patterns(winners, losers),
    fixes: thin ? [] : fixes,
    keeps: thin ? [] : keeps,
    checklist: thin ? [] : buildChecklist(fixes, keeps),
    kols,
    metas: metaReports(ordered),
    equity: equity(ordered),
    trades: annotated.sort((a, b) => b.entryAt.localeCompare(a.entryAt)),
    thin,
  };
}

function summarize(trades: RoundTrip[]): Summary {
  const winners = winsOf(trades);
  const losers = lossesOf(trades);
  const grossProfitUsd = money(sum(winners.map((trade) => trade.pnlUsd)));
  const grossLossUsd = money(sum(losers.map((trade) => trade.pnlUsd)));
  const dates = trades.map((trade) => trade.entryAt).sort();
  return {
    trades: trades.length,
    wins: winners.length,
    losses: losers.length,
    winRate: winRate(trades),
    netPnlUsd: money(net(trades)),
    grossProfitUsd,
    grossLossUsd,
    profitFactor: grossLossUsd < 0 ? money(grossProfitUsd / Math.abs(grossLossUsd)) : null,
    expectancyUsd: trades.length ? money(net(trades) / trades.length) : 0,
    avgWinPct: average(winners.map((trade) => trade.pnlPct)),
    avgLossPct: average(losers.map((trade) => trade.pnlPct)),
    medianHold: median(trades.map((trade) => trade.holdMinutes)),
    spanLabel: dates.length ? span(dates[0], dates[dates.length - 1]) : "—",
  };
}

function portrait(trades: RoundTrip[]): SidePortrait {
  const launch = trades.map((trade) => trade.minutesFromLaunch).filter((value) => value >= 0);
  const meta = mode(trades.flatMap((trade) => trade.metas.map((id) => META_LABEL[id])));
  const kols = trades.flatMap((trade) => trade.kols.map((kol) => kolLabel(kol)));
  return {
    trades: trades.length,
    medianEntryMc: median(trades.map((trade) => trade.entryMarketCapUsd).filter((value) => value > 0)),
    medianSize: median(trades.map((trade) => trade.amountUsd)),
    medianHold: median(trades.map((trade) => trade.holdMinutes)),
    medianLiquidity: median(trades.map((trade) => trade.liquidityUsd).filter((value) => value > 0)),
    medianLaunchMin: launch.length ? median(launch) : -1,
    avgKols: trades.length ? average(trades.map((trade) => trade.kols.length)) : 0,
    topMeta: meta,
    topSession: mode(trades.map((trade) => sessionName(trade))),
    topKols: topNames(kols, 3),
    netPnlUsd: money(net(trades)),
  };
}

function patterns(winners: RoundTrip[], losers: RoundTrip[]): Pattern[] {
  const all = [...winners, ...losers];
  const groups = new Map<string, { label: string; trades: RoundTrip[] }>();
  const add = (trade: RoundTrip, id: string, label: string) => {
    const row = groups.get(id) ?? { label, trades: [] };
    row.trades.push(trade);
    groups.set(id, row);
  };

  for (const trade of all) {
    const mc = mcBand(trade.entryMarketCapUsd);
    if (mc) add(trade, `mc:${mc}`, `Entry market cap ${mc}`);
    add(trade, `size:${sizeBand(trade.amountUsd)}`, `Ticket ${sizeBand(trade.amountUsd)}`);
    add(trade, `hold:${holdBand(trade.holdMinutes)}`, `Held ${holdBand(trade.holdMinutes).toLowerCase()}`);
    add(trade, `session:${sessionName(trade)}`, `${sessionName(trade)} session`);
    add(trade, `kol:${kolMode(trade)}`, kolModeLabel(kolMode(trade)));
    for (const meta of trade.metas) add(trade, `meta:${meta}`, META_LABEL[meta]);
    for (const kol of trade.kols) {
      if (kol.timing === "after") add(trade, `kol-after:${kol.id}`, `${kolLabel(kol)} showed up after`);
      else add(trade, `kol-early:${kol.id}`, `${kolLabel(kol)} was already in`);
    }
  }

  const rows: Pattern[] = [];
  for (const [id, group] of groups) {
    if (group.trades.length < 4) continue;
    const winIds = new Set(winners.map((trade) => trade.id));
    const lossIds = new Set(losers.map((trade) => trade.id));
    const groupWins = group.trades.filter((trade) => winIds.has(trade.id));
    const groupLosses = group.trades.filter((trade) => lossIds.has(trade.id));
    const winnerShare = winners.length ? groupWins.length / winners.length : 0;
    const loserShare = losers.length ? groupLosses.length / losers.length : 0;
    const gap = Math.abs(winnerShare - loserShare);
    if (gap < 0.18) continue;
    rows.push({
      id,
      label: group.label,
      side: winnerShare > loserShare ? "win" : "loss",
      winnerShare,
      loserShare,
      winRate: winRate(group.trades),
      n: group.trades.length,
      netPnlUsd: money(net(group.trades)),
      tradeIds: group.trades.map((trade) => trade.id),
    });
  }

  const wins = rows.filter((row) => row.side === "win").sort((a, b) => b.winnerShare - b.loserShare - (a.winnerShare - a.loserShare));
  const losses = rows.filter((row) => row.side === "loss").sort((a, b) => b.loserShare - b.winnerShare - (a.loserShare - a.winnerShare));
  return [...wins.slice(0, 4), ...losses.slice(0, 4)];
}

function kolReports(trades: RoundTrip[]): KolReport[] {
  const groups = new Map<string, { name: string; handle: string; wallet?: string; trades: RoundTrip[]; timings: string[] }>();
  for (const trade of trades) {
    if (trade.kols.length === 0) {
      const row = groups.get("none") ?? { name: "No KOL", handle: "", trades: [], timings: [] };
      row.trades.push(trade);
      groups.set("none", row);
      continue;
    }
    for (const kol of trade.kols) {
      const row = groups.get(kol.id) ?? { name: kol.name, handle: kol.handle, wallet: kol.wallet, trades: [], timings: [] };
      row.trades.push(trade);
      row.timings.push(kol.timing);
      groups.set(kol.id, row);
    }
  }
  const reports: KolReport[] = [];
  for (const [id, group] of groups) {
    reports.push({
      id,
      name: group.name,
      handle: group.handle,
      wallet: group.wallet,
      trades: group.trades.length,
      winRate: winRate(group.trades),
      netPnlUsd: money(net(group.trades)),
      usualTiming: group.timings.length ? mode(group.timings) : "—",
      tradeIds: group.trades.map((trade) => trade.id),
    });
  }
  return reports.sort((a, b) => a.netPnlUsd - b.netPnlUsd);
}

function metaReports(trades: RoundTrip[]): MetaReport[] {
  const groups = new Map<MetaId, RoundTrip[]>();
  for (const trade of trades) {
    for (const meta of trade.metas) groups.set(meta, [...(groups.get(meta) ?? []), trade]);
  }
  return [...groups.entries()]
    .map(([id, subset]) => ({
      id,
      label: META_LABEL[id],
      trades: subset.length,
      winRate: winRate(subset),
      netPnlUsd: money(net(subset)),
      medianEntryMc: median(subset.map((trade) => trade.entryMarketCapUsd)),
      tradeIds: subset.map((trade) => trade.id),
    }))
    .sort((a, b) => a.netPnlUsd - b.netPnlUsd);
}

function polishNames(
  comparison: { winners: SidePortrait; losers: SidePortrait },
  kols: KolReport[],
): void {
  const green = new Set(kols.filter((kol) => kol.netPnlUsd > 0 && kol.winRate >= 0.55).map((kol) => kolLabel(kol)));
  const red = new Set(kols.filter((kol) => kol.netPnlUsd < 0 && kol.winRate <= 0.4).map((kol) => kolLabel(kol)));
  comparison.winners.topKols = comparison.winners.topKols.filter((name) => !red.has(name));
  comparison.losers.topKols = comparison.losers.topKols.filter((name) => !green.has(name));
  if (comparison.losers.topKols.length === 0) {
    comparison.losers.topKols = kols
      .filter((kol) => kol.usualTiming === "after" && kol.netPnlUsd < 0)
      .map((kol) => kolLabel(kol))
      .slice(0, 3);
  }
}

function equity(trades: RoundTrip[]): EquityPoint[] {
  let running = 0;
  return [...trades]
    .sort((a, b) => a.exitAt.localeCompare(b.exitAt))
    .map((trade) => {
      running = money(running + trade.pnlUsd);
      return { at: trade.exitAt, pnl: running };
    });
}

function annotate(
  trade: RoundTrip,
  winners: RoundTrip[],
  losers: RoundTrip[],
  fixes: { shortLabel: string; tradeIds: string[] }[],
  revenge: Set<string>,
): AnnotatedTrade {
  const tags = fixes.filter((fix) => fix.tradeIds.includes(trade.id)).map((fix) => fix.shortLabel);
  return {
    ...trade,
    result: trade.pnlUsd >= 0 ? "win" : "loss",
    tags,
    note: trade.pnlUsd < 0 ? lossNote(trade, winners) : winNote(trade, winners, losers),
    session: sessionName(trade),
    revenge: revenge.has(trade.id),
  };
}

function lossNote(trade: RoundTrip, winners: RoundTrip[]): string {
  const peers = winners.filter((winner) => winner.metas.some((meta) => trade.metas.includes(meta)));
  const pool = peers.length >= 3 ? peers : winners;
  if (pool.length === 0) return "There are no winning trades in this book to set beside this one yet.";
  const meta = META_LABEL[trade.metas[0] ?? "other"].toLowerCase();
  const scope = peers.length >= 3 ? `Winners in ${meta}` : "Winners";
  const kols = topNames(pool.flatMap((row) => row.kols.filter((kol) => kol.timing !== "after").map((kol) => kolLabel(kol))), 2);
  const kolBit = kols.length > 0 ? `, with ${kols.join(" or ")} already in` : "";
  const yours = trade.kols.length === 0 ? "no tagged KOL" : trade.kols.map((kol) => `${kolLabel(kol)} ${kol.timing}`).join(", ");
  return `${scope} entered near ${fmtMc(median(pool.map((row) => row.entryMarketCapUsd)))}${kolBit}, sized around ${fmtUsdPlain(median(pool.map((row) => row.amountUsd)))}, and held about ${fmtHold(median(pool.map((row) => row.holdMinutes)))}. This one entered at ${fmtMc(trade.entryMarketCapUsd)} with ${yours}, sized ${fmtUsdPlain(trade.amountUsd)}, and was closed in ${fmtHold(trade.holdMinutes)}.`;
}

function winNote(trade: RoundTrip, winners: RoundTrip[], losers: RoundTrip[]): string {
  if (winners.length < 3) return "A green close. More winners will show whether the conditions repeat.";
  const loserMc = losers.length ? median(losers.map((row) => row.entryMarketCapUsd)) : 0;
  const mcBit =
    trade.entryMarketCapUsd > 0 && loserMc > trade.entryMarketCapUsd * 1.5
      ? ` The losing entries sat nearer ${fmtMc(loserMc)}.`
      : "";
  return `Fits the winning cluster: ${fmtMc(trade.entryMarketCapUsd)} entry, ${fmtUsdPlain(trade.amountUsd)} ticket, ${fmtHold(trade.holdMinutes)} hold, ${sessionName(trade).toLowerCase()}.${mcBit}`;
}

function writeLede(
  comparison: { winners: SidePortrait; losers: SidePortrait },
  summary: Summary,
): string {
  const { winners, losers } = comparison;
  if (winners.trades === 0 || losers.trades === 0) {
    return summary.netPnlUsd >= 0
      ? "Every closed trade in this window is green. The desk needs some red trades before it can show the split."
      : "Every closed trade in this window is red. The desk needs some green trades before a repeatable habit shows up.";
  }
  const kols = winners.topKols.length > 0 ? ` ${winners.topKols.slice(0, 2).join(" and ")} show up on that side.` : "";
  return `Winners cluster near ${fmtMc(winners.medianEntryMc)} market cap, about ${fmtUsdPlain(winners.medianSize)} a ticket, held around ${fmtHold(winners.medianHold)}, mostly in the ${winners.topSession.toLowerCase()} session.${kols} Losers cluster near ${fmtMc(losers.medianEntryMc)}, about ${fmtUsdPlain(losers.medianSize)} a ticket, mostly in the ${losers.topSession.toLowerCase()} session, in ${losers.topMeta.toLowerCase()}. The book is ${fmtUsd(summary.netPnlUsd)} over ${summary.trades} closed trades. The suggestions below come from the gap between those two clusters.`;
}

function thinLede(count: number): string {
  return `${count} closed round trip${count === 1 ? "" : "s"} so far. Suggestions start at 8 closed trades, and they get specific around 20. Size, market cap, and the hour are worth reading now. Two base rules start on: exit under half the position, and a base trade of at most 10% of the portfolio.`;
}

function kolModeLabel(modeName: ReturnType<typeof kolMode>): string {
  if (modeName === "early") return "A KOL was already in";
  if (modeName === "late") return "A KOL showed up only after";
  return "No KOL tagged";
}

function topNames(names: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function span(start: string, end: string): string {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
  return `${format.format(new Date(start))} – ${format.format(new Date(end))}`;
}
