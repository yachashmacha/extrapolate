import { isWalletAddress } from "@/lib/address";
import type { BuySignal, ClosedTrade, CopyBook, CopyFill, FireEvent, WalletScore } from "@/lib/gropy/types";

/**
 * A copied wallet is fired when losing closes while they are being copied go past this count.
 * Two losses stay. The third fires them.
 */
export const FIRE_LOSS_LIMIT = 2;

export function isFired(losses: number): boolean {
  return losses > FIRE_LOSS_LIMIT;
}

export function lossCount(trades: readonly { pnlUsd: number }[]): number {
  return trades.reduce((count, trade) => (trade.pnlUsd < 0 ? count + 1 : count), 0);
}

export function walletResult(wallet: string, trades: readonly ClosedTrade[]): WalletScore {
  const own = trades.filter((trade) => trade.wallet === wallet && Number.isFinite(trade.pnlUsd));
  const realizedUsd = own.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  return {
    wallet,
    closed: own.length,
    losses: lossCount(own),
    realizedUsd,
    profitable: own.length > 0 && realizedUsd > 0,
  };
}

/** Wallets with at least one verified close and a positive realized result. */
export function eligibleWallets(trades: readonly ClosedTrade[]): WalletScore[] {
  const ids = [...new Set(trades.map((trade) => trade.wallet))];
  return ids
    .map((wallet) => walletResult(wallet, trades))
    .filter((score) => score.profitable)
    .sort(byBetterResult);
}

/**
 * The next wallet must be a different one, still eligible, not already fired,
 * and ahead of the fired wallet on verified realized pnl.
 */
export function pickReplacement(
  firedWallet: string,
  firedRealizedUsd: number,
  scores: readonly WalletScore[],
  alreadyFired: ReadonlySet<string>,
): WalletScore | null {
  return (
    scores
      .filter(
        (score) =>
          score.wallet !== firedWallet &&
          !alreadyFired.has(score.wallet) &&
          score.profitable &&
          score.realizedUsd > firedRealizedUsd,
      )
      .sort(byBetterResult)[0] ?? null
  );
}

function byBetterResult(left: WalletScore, right: WalletScore): number {
  return right.realizedUsd - left.realizedUsd || left.wallet.localeCompare(right.wallet);
}

interface CloseEvent {
  at: number;
  kind: "close";
  trade: ClosedTrade;
}

interface BuyEvent {
  at: number;
  kind: "buy";
  buy: BuySignal;
}

type BookEvent = CloseEvent | BuyEvent;

/**
 * Walk verified closes and buys in time order.
 * A wallet is seated only while their verified realized result is positive.
 * Losses count only after the seat starts. Past two losses, the wallet is fired
 * and is not seated again. The replacement has to be doing better on verified pnl.
 * A buy is mirrored only while that wallet is seated, and only when the coin is named.
 */
export function runCopyBook(closed: readonly ClosedTrade[], buys: readonly BuySignal[]): CopyBook {
  const realized = new Map<string, number>();
  const closedCount = new Map<string, number>();
  const lifetimeLosses = new Map<string, number>();
  const fired = new Set<string>();
  const copies: CopyFill[] = [];
  const fires: FireEvent[] = [];
  let copying: string | null = null;
  let losses = 0;
  let lastFiredRealized: number | null = null;
  let skippedUnnamedBuys = 0;

  const scoresNow = (): WalletScore[] => {
    const scores: WalletScore[] = [];
    for (const [wallet, count] of closedCount) {
      const realizedUsd = realized.get(wallet) ?? 0;
      scores.push({
        wallet,
        closed: count,
        losses: lifetimeLosses.get(wallet) ?? 0,
        realizedUsd,
        profitable: count > 0 && realizedUsd > 0,
      });
    }
    return scores;
  };

  const seat = (wallet: string) => {
    copying = wallet;
    losses = 0;
  };

  const considerSeat = () => {
    if (copying) return;
    const scores = scoresNow();
    if (lastFiredRealized === null) {
      const best = scores.filter((score) => score.profitable && !fired.has(score.wallet)).sort(byBetterResult)[0];
      if (best) seat(best.wallet);
      return;
    }
    const replacement = pickReplacement("__seat__", lastFiredRealized, scores, fired);
    if (replacement) seat(replacement.wallet);
  };

  const fire = (wallet: string, at: string) => {
    const firedRealizedUsd = realized.get(wallet) ?? 0;
    fired.add(wallet);
    lastFiredRealized = firedRealizedUsd;
    const replacement = pickReplacement(wallet, firedRealizedUsd, scoresNow(), fired);
    fires.push({
      at,
      firedWallet: wallet,
      losses,
      firedRealizedUsd,
      replacementWallet: replacement?.wallet ?? null,
      replacementRealizedUsd: replacement?.realizedUsd ?? null,
    });
    if (replacement) seat(replacement.wallet);
    else {
      copying = null;
      losses = 0;
    }
  };

  for (const event of timeline(closed, buys)) {
    if (event.kind === "close") {
      const trade = event.trade;
      realized.set(trade.wallet, (realized.get(trade.wallet) ?? 0) + trade.pnlUsd);
      closedCount.set(trade.wallet, (closedCount.get(trade.wallet) ?? 0) + 1);
      if (trade.pnlUsd < 0) lifetimeLosses.set(trade.wallet, (lifetimeLosses.get(trade.wallet) ?? 0) + 1);
      if (copying === trade.wallet && trade.pnlUsd < 0) losses += 1;
      if (copying === trade.wallet && isFired(losses)) {
        fire(trade.wallet, trade.closedAt);
      } else if (copying === trade.wallet && (realized.get(trade.wallet) ?? 0) <= 0) {
        copying = null;
        losses = 0;
        considerSeat();
      } else if (!copying) {
        considerSeat();
      }
      continue;
    }

    if (copying !== event.buy.wallet) continue;
    const coin = coinLabel(event.buy);
    if (!coin) {
      skippedUnnamedBuys += 1;
      continue;
    }
    const fill: CopyFill = {
      id: event.buy.id,
      wallet: event.buy.wallet,
      boughtAt: event.buy.boughtAt,
      coin,
    };
    if (typeof event.buy.amountUsd === "number" && Number.isFinite(event.buy.amountUsd)) fill.amountUsd = event.buy.amountUsd;
    if (typeof event.buy.entryMarketCapUsd === "number" && Number.isFinite(event.buy.entryMarketCapUsd) && event.buy.entryMarketCapUsd > 0) {
      fill.entryMarketCapUsd = event.buy.entryMarketCapUsd;
    }
    copies.push(fill);
  }

  return {
    copying,
    lossesTowardFire: copying ? losses : 0,
    copyingRealizedUsd: copying ? realized.get(copying) ?? 0 : null,
    copyingCloses: copying ? closedCount.get(copying) ?? 0 : null,
    copies,
    fires,
    skippedUnnamedBuys,
  };
}

function timeline(closed: readonly ClosedTrade[], buys: readonly BuySignal[]): BookEvent[] {
  const events: BookEvent[] = [];
  for (const trade of closed) {
    if (!Number.isFinite(trade.pnlUsd)) continue;
    const at = Date.parse(trade.closedAt);
    if (!Number.isFinite(at)) continue;
    events.push({ at, kind: "close", trade });
  }
  for (const buy of buys) {
    const at = Date.parse(buy.boughtAt);
    if (!Number.isFinite(at)) continue;
    events.push({ at, kind: "buy", buy });
  }
  events.sort((left, right) => left.at - right.at || kindOrder(left) - kindOrder(right) || eventId(left).localeCompare(eventId(right)));
  return events;
}

function kindOrder(event: BookEvent): number {
  return event.kind === "close" ? 0 : 1;
}

function eventId(event: BookEvent): string {
  return event.kind === "close" ? event.trade.id : event.buy.id;
}

function coinLabel(buy: BuySignal): string | null {
  const symbol = cleanCoin(buy.symbol, buy.mint);
  if (symbol) return symbol;
  return cleanCoin(buy.coinName, buy.mint);
}

function cleanCoin(value: string | undefined, mint: string): string | null {
  const text = value?.trim() ?? "";
  if (!text || text === mint || text.includes("·") || text.includes("…") || isWalletAddress(text)) return null;
  return text;
}
