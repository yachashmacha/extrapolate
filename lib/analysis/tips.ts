import { bookBounds, type BookBounds } from "@/lib/analysis/bounds";
import { median } from "@/lib/analysis/stats";
import { kolMode } from "@/lib/analysis/slices";
import { fmtCoin, fmtHold, fmtMc, fmtUsdPlain } from "@/lib/format";
import { kolLabel } from "@/lib/kols";
import { META_LABEL } from "@/lib/metas";
import { overEntryShare } from "@/lib/rules";
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

export function practiceTips(trades: AnnotatedTrade[], bounds?: BookBounds): PracticeTip[] {
  const winners = trades.filter((trade) => trade.result === "win");
  const limits = bounds ?? bookBounds({ trades });
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
      tip: writeTip(trade, winners, limits, trades),
    }));
}

export function kolBoughtLine(kols: KolTag[]): string {
  if (kols.length === 0) return "No KOL";
  const shown = kols.slice(0, 4).map((kol) => `${kolLabel(kol)}, ${timingLabel(kol.timing)}`);
  const more = kols.length > 4 ? ` · +${kols.length - 4} more` : "";
  return `${shown.join(" · ")}${more}`;
}

function writeTip(trade: AnnotatedTrade, winners: AnnotatedTrade[], bounds: BookBounds, book: AnnotatedTrade[]): string {
  const bought =
    trade.entryMarketCapUsd > 0
      ? `${fmtUsdPlain(trade.amountUsd)} bought at ${fmtCoin(trade.entryMarketCapUsd)}`
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
  const winHold = median(pool.map((row) => row.holdMinutes));
  const earlyNames = topNames(
    pool.flatMap((row) => row.kols.filter((kol) => kol.timing !== "after").map((kol) => kolLabel(kol))),
    2,
  );
  const ticket = bounds.ticketUsd;
  const passMc = bounds.maxMcUsd != null && bounds.maxMcUsd > 0 ? Math.min(bounds.maxMcUsd, winMc > 0 ? winMc : bounds.maxMcUsd) : winMc;
  const mcFromRule = bounds.maxMcUsd != null && bounds.maxMcUsd > 0 && passMc === bounds.maxMcUsd && (winMc === 0 || bounds.maxMcUsd < winMc);

  const actions: string[] = [];
  if (pastTicketOverCeiling(trade, book, bounds)) {
    actions.push(`Keep the next trade at ${fmtUsdPlain(ticket)}. ${ticketWhy(bounds)}`);
  }
  if (trade.entryMarketCapUsd > 0 && passMc > 0 && trade.entryMarketCapUsd > passMc * (mcFromRule ? 1.05 : 1.5)) {
    actions.push(
      mcFromRule
        ? `Your rule “${bounds.mcRule}” draws the line at ${fmtMc(passMc)}. ${trade.symbol} was entered above it.`
        : `In your trades, the ${where} got in near ${fmtMc(passMc)}. ${trade.symbol} was entered above that.`,
    );
  }
  const mode = kolMode(trade);
  if (mode !== "early" && earlyNames.length > 0 && ticket > 0) {
    const wait =
      mode === "late"
        ? `In your trades, the ${where} more often had ${joinOr(earlyNames)} in before the buy. A caller who shows up after ${trade.symbol} is a later buy, not a confirmation.`
        : `In your trades, the ${where} more often had ${joinOr(earlyNames)} in before the buy. That order is not a confirmation.`;
    const sized =
      bounds.ticketReason === "account" || bounds.ticketReason === "account-rule"
        ? `The trade stays at ${fmtUsdPlain(ticket)} for this wallet.`
        : `The trade stays at ${fmtUsdPlain(ticket)}.`;
    actions.push(`${wait} ${sized}`);
  }
  if (trade.revenge && ticket > 0) {
    actions.push(`The next buy after this red close goes back to ${fmtUsdPlain(ticket)}. ${ticketWhy(bounds)}`);
  }
  if (
    trade.session === "Overnight" &&
    pool.filter((row) => row.session !== "Overnight").length >= Math.ceil(pool.length * 0.6)
  ) {
    actions.push(
      bounds.overnightRule
        ? `Your rule says “${bounds.overnightRule}”. ${trade.symbol} was an overnight entry.`
        : `In your trades, the ${where} closed during the day. ${trade.symbol} was an overnight buy.`,
    );
  }
  if (bounds.onePerCoin && trade.buys > 1) {
    actions.push(`Your rule is one trade per coin (“${bounds.onePerCoin}”). ${trade.symbol} was bought ${trade.buys} times.`);
  }
  if (actions.length === 0) {
    actions.push(
      `Nothing else in your trades separates ${trade.symbol} on size, market cap, or time of day. The ${where} were held about ${fmtHold(winHold)}. ${trade.symbol} was held ${fmtHold(trade.holdMinutes)}. That hold is your record, not a target.`,
    );
  }

  return `${loss} ${who} ${actions.slice(0, 4).join(" ")}`;
}

/** The size nudge looks at this loss against the portfolio when it was taken. The dollar it names is still the next ticket. */
function pastTicketOverCeiling(trade: AnnotatedTrade, book: AnnotatedTrade[], bounds: BookBounds): boolean {
  if (!(bounds.ticketUsd > 0)) return false;
  const share = bounds.portfolioShare;
  const portfolioBound =
    (bounds.ticketReason === "account" || bounds.ticketReason === "account-rule") &&
    share != null &&
    share > 0 &&
    bounds.accountUsd != null &&
    bounds.accountUsd > 0;
  if (!portfolioBound) return trade.amountUsd > bounds.ticketUsd * 1.25;
  return overEntryShare(trade, book, {
    accountUsd: bounds.accountUsd,
    cashUsd: bounds.cashUsd,
    fraction: share,
    slack: 1.25,
  });
}

export function ticketWhy(bounds: BookBounds): string {
  if (bounds.ticketReason === "account" && bounds.accountUsd && bounds.portfolioShare != null) {
    const pct = `${Math.round(bounds.portfolioShare * 100)}%`;
    const quote = bounds.portfolioRule ? ` Your rule says “${bounds.portfolioRule}”.` : "";
    return `That is ${pct} of the ${fmtUsdPlain(bounds.accountUsd)} in this wallet.${quote}`;
  }
  if (bounds.ticketReason === "account" && bounds.accountUsd) {
    return `That is the ${fmtUsdPlain(bounds.accountUsd)} cash in this wallet.`;
  }
  if (bounds.ticketReason === "account-rule") {
    if (bounds.cashBinds && bounds.portfolioRule) {
      const cash = bounds.cashUsd ?? bounds.accountUsd;
      const cashBit = cash != null ? `the ${fmtUsdPlain(cash)} cash on hand` : "the cash on hand";
      return `Your rule “${bounds.portfolioRule}” and ${cashBit} both hold it there.`;
    }
    const held = bounds.cashBinds && bounds.cashUsd != null ? bounds.cashUsd : bounds.accountUsd;
    const cash = held != null ? `the ${fmtUsdPlain(held)} in this wallet` : "the cash in this wallet";
    const quoted = bounds.sizeRule ?? bounds.portfolioRule;
    return quoted ? `Your rule “${quoted}” and ${cash} both hold it there.` : `The cash in this wallet holds it there.`;
  }
  if (bounds.ticketReason === "rule" && bounds.sizeRule) {
    return `Your rule sets it: “${bounds.sizeRule}”.`;
  }
  return "That is the size the winning trades used.";
}

/** The day report quotes this whenever the portfolio and the size rule are both known. */
export function baseTicketSentence(bounds: BookBounds): string {
  if (!(bounds.ticketUsd > 0) || !bounds.portfolioRule || bounds.portfolioShare == null || !bounds.accountUsd) return "";
  const pct = `${Math.round(bounds.portfolioShare * 100)}%`;
  const cap = fmtUsdPlain(bounds.accountUsd * bounds.portfolioShare);
  if (bounds.cashBinds) {
    const cash = bounds.cashUsd ?? bounds.accountUsd;
    return `The base trade stays at ${fmtUsdPlain(bounds.ticketUsd)}, the cash on hand. Your rule “${bounds.portfolioRule}” is ${pct} of the portfolio (${cap}), and that is more than the ${fmtUsdPlain(cash)} you can spend.`;
  }
  if (bounds.ticketReason === "account" || bounds.ticketReason === "account-rule") {
    return `The base trade stays at ${fmtUsdPlain(bounds.ticketUsd)}, ${pct} of the ${fmtUsdPlain(bounds.accountUsd)} portfolio. Your rule says “${bounds.portfolioRule}”.`;
  }
  return `The base trade stays at ${fmtUsdPlain(bounds.ticketUsd)}, inside the ${cap} cap, ${pct} of the ${fmtUsdPlain(bounds.accountUsd)} portfolio. Your rule says “${bounds.portfolioRule}”.`;
}

function kolSentence(trade: AnnotatedTrade): string {
  if (trade.kols.length === 0) return "No KOL was in the coin.";
  const bits = trade.kols.slice(0, 3).map((kol) => `${kolLabel(kol)} (${timingLabel(kol.timing)})`);
  const rest = trade.kols.length - bits.length;
  if (rest > 0) bits.push(`${rest} more tracked ${rest === 1 ? "wallet" : "wallets"}`);
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
