import { median } from "@/lib/analysis/stats";
import { kolMode } from "@/lib/analysis/slices";
import { fmtHold, fmtMc, fmtUsdPlain } from "@/lib/format";
import { META_LABEL } from "@/lib/metas";
import type { AnnotatedTrade, KolTag, KolTiming } from "@/lib/types";

export interface PracticeTip {
  id: string;
  tradeId: string;
  symbol: string;
  entryAt: string;
  entryMarketCapUsd: number;
  amountUsd: number;
  pnlUsd: number;
  pnlPct: number;
  kols: KolTag[];
  tip: string;
}

export function practiceTips(trades: AnnotatedTrade[]): PracticeTip[] {
  const winners = trades.filter((trade) => trade.result === "win");
  return trades
    .filter((trade) => trade.result === "loss")
    .sort((left, right) => left.pnlUsd - right.pnlUsd || right.exitAt.localeCompare(left.exitAt))
    .map((trade) => ({
      id: trade.id,
      tradeId: trade.id,
      symbol: trade.symbol,
      entryAt: trade.entryAt,
      entryMarketCapUsd: trade.entryMarketCapUsd,
      amountUsd: trade.amountUsd,
      pnlUsd: trade.pnlUsd,
      pnlPct: trade.pnlPct,
      kols: trade.kols,
      tip: writeTip(trade, winners),
    }));
}

export function kolBoughtLine(kols: KolTag[]): string {
  if (kols.length === 0) return "No KOL tagged";
  return kols.map((kol) => `${kol.name}, ${timingLabel(kol.timing)}`).join(" · ");
}

function writeTip(trade: AnnotatedTrade, winners: AnnotatedTrade[]): string {
  const bought =
    trade.entryMarketCapUsd > 0
      ? `${fmtUsdPlain(trade.amountUsd)} bought at ${fmtMc(trade.entryMarketCapUsd)}`
      : `${fmtUsdPlain(trade.amountUsd)} bought at an unknown market cap`;
  const loss = `${trade.symbol} lost ${fmtUsdPlain(Math.abs(trade.pnlUsd))} on ${bought}.`;
  const who = kolSentence(trade);
  if (winners.length < 3) {
    return `${loss} ${who} More green trades will show whether to change the entry, the size, or the caller.`;
  }

  const peers = winners.filter((winner) => winner.metas.some((meta) => trade.metas.includes(meta)));
  const pool = peers.length >= 3 ? peers : winners;
  const scoped = peers.length >= 3;
  const meta = META_LABEL[trade.metas[0] ?? "other"];
  const where = scoped ? `${meta} winners` : "winners";
  const winMc = median(pool.map((row) => row.entryMarketCapUsd));
  const winSize = median(pool.map((row) => row.amountUsd));
  const winHold = median(pool.map((row) => row.holdMinutes));
  const earlyNames = topNames(
    pool.flatMap((row) => row.kols.filter((kol) => kol.timing !== "after").map((kol) => kol.name)),
    2,
  );

  const actions: string[] = [];
  if (trade.entryMarketCapUsd > 0 && winMc > 0 && trade.entryMarketCapUsd > winMc * 1.5) {
    actions.push(`Pass once the coin clears ${fmtMc(winMc)}, where the ${where} got in.`);
  }
  const mode = kolMode(trade);
  if (mode !== "early" && earlyNames.length > 0) {
    actions.push(
      mode === "late"
        ? `Wait until ${joinOr(earlyNames)} is already in. A caller who arrives after ${trade.symbol} leaves the buy unconfirmed.`
        : `Wait until ${joinOr(earlyNames)} is already in before a buy like ${trade.symbol}.`,
    );
  }
  if (winSize > 0 && trade.amountUsd > winSize * 1.5) {
    actions.push(`Keep the next ticket near ${fmtUsdPlain(winSize)}, the size those winners used.`);
  }
  if (trade.revenge && winSize > 0) {
    actions.push(`The next buy after this red close goes back to ${fmtUsdPlain(winSize)}.`);
  }
  if (trade.session === "Overnight" && pool.filter((row) => row.session !== "Overnight").length >= Math.ceil(pool.length * 0.6)) {
    actions.push(`Skip the overnight window. The ${where} closed in the daytime sessions.`);
  }
  if (actions.length === 0) {
    actions.push(`Take the exit the ${where} used, about ${fmtHold(winHold)}. ${trade.symbol} was held ${fmtHold(trade.holdMinutes)}.`);
  }

  return `${loss} ${who} ${actions.slice(0, 3).join(" ")}`;
}

function kolSentence(trade: AnnotatedTrade): string {
  if (trade.kols.length === 0) return "No KOL was tagged on it.";
  const bits = trade.kols.map((kol) => `${kol.name} (${timingLabel(kol.timing)})`);
  return `${joinAnd(bits)} ${trade.kols.length === 1 ? "was" : "were"} in the coin.`;
}

function timingLabel(timing: KolTiming): string {
  if (timing === "before") return "before you";
  if (timing === "with") return "with you";
  return "after you";
}

function topNames(names: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

function joinAnd(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function joinOr(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}
