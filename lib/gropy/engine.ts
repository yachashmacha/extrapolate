import { isWalletAddress } from "@/lib/address";
import type { BuySignal, ClosedTrade, CopyBook, CopyFill, FireEvent, SeatChange, SeatedBuyCap, WalletScore } from "@/lib/gropy/types";

/**
 * A copied wallet is fired when losing closes while they are being copied go past this count.
 * Two losses stay. The third fires them.
 */
export const FIRE_LOSS_LIMIT = 2;

export function isFired(losses: number): boolean {
  return losses > FIRE_LOSS_LIMIT;
}

/** SOL when the swap record has it, otherwise the dollar result. A missing number does not qualify. */
export function tradePnl(trade: { pnlUsd?: number; pnlSol?: number }): number {
  if (typeof trade.pnlSol === "number" && Number.isFinite(trade.pnlSol)) return trade.pnlSol;
  if (typeof trade.pnlUsd === "number" && Number.isFinite(trade.pnlUsd)) return trade.pnlUsd;
  return Number.NaN;
}

export function lossCount(trades: readonly { pnlUsd?: number; pnlSol?: number }[]): number {
  return trades.reduce((count, trade) => (tradePnl(trade) < 0 ? count + 1 : count), 0);
}

export function walletResult(wallet: string, trades: readonly ClosedTrade[]): WalletScore {
  const own = trades.filter((trade) => trade.wallet === wallet && Number.isFinite(tradePnl(trade)));
  const realizedUsd = own.reduce((sum, trade) => sum + tradePnl(trade), 0);
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
  const switches: SeatChange[] = [];
  let copying: string | null = null;
  let losses = 0;
  let seatStats = emptySeat();
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
    seatStats = emptySeat();
  };

  const considerSeat = (): string | null => {
    if (copying) return copying;
    const scores = scoresNow();
    if (lastFiredRealized === null) {
      const best = scores.filter((score) => score.profitable && !fired.has(score.wallet)).sort(byBetterResult)[0];
      if (best) seat(best.wallet);
      return best?.wallet ?? null;
    }
    const replacement = pickReplacement("__seat__", lastFiredRealized, scores, fired);
    if (replacement) seat(replacement.wallet);
    return replacement?.wallet ?? null;
  };

  const rememberSwitch = (wallet: string, at: string, trigger: SeatChange["trigger"], toWallet: string | null, toRealized: number | null) => {
    switches.push({
      at,
      fromWallet: wallet,
      toWallet,
      losses: seatStats.losses,
      streak: seatStats.streak,
      lost: seatStats.lost,
      fromRealized: realized.get(wallet) ?? 0,
      toRealized,
      trigger,
      lossCoins: seatStats.lossCoins.slice(),
      buyCaps: seatStats.buyCaps.slice(),
    });
  };

  const fire = (wallet: string, at: string) => {
    const firedRealizedUsd = realized.get(wallet) ?? 0;
    fired.add(wallet);
    lastFiredRealized = firedRealizedUsd;
    const replacement = pickReplacement(wallet, firedRealizedUsd, scoresNow(), fired);
    rememberSwitch(wallet, at, "losses", replacement?.wallet ?? null, replacement?.realizedUsd ?? null);
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
      seatStats = emptySeat();
    }
  };

  for (const event of timeline(closed, buys)) {
    if (event.kind === "close") {
      const trade = event.trade;
      const pnl = tradePnl(trade);
      realized.set(trade.wallet, (realized.get(trade.wallet) ?? 0) + pnl);
      closedCount.set(trade.wallet, (closedCount.get(trade.wallet) ?? 0) + 1);
      if (pnl < 0) lifetimeLosses.set(trade.wallet, (lifetimeLosses.get(trade.wallet) ?? 0) + 1);
      if (copying === trade.wallet) {
        if (pnl < 0) {
          losses += 1;
          seatStats.losses = losses;
          seatStats.streak += 1;
          seatStats.lost += Math.abs(pnl);
          const coin = coinOf(trade.symbol, trade.coinName, trade.mint);
          if (coin) seatStats.lossCoins.push(coin);
        } else {
          seatStats.streak = 0;
        }
      }
      if (copying === trade.wallet && isFired(losses)) {
        fire(trade.wallet, trade.closedAt);
      } else if (copying === trade.wallet && (realized.get(trade.wallet) ?? 0) <= 0) {
        const from = trade.wallet;
        const kept = {
          losses: seatStats.losses,
          streak: seatStats.streak,
          lost: seatStats.lost,
          lossCoins: seatStats.lossCoins.slice(),
          buyCaps: seatStats.buyCaps.slice(),
        };
        copying = null;
        const next = considerSeat();
        switches.push({
          at: trade.closedAt,
          fromWallet: from,
          toWallet: next,
          losses: kept.losses,
          streak: kept.streak,
          lost: kept.lost,
          fromRealized: realized.get(from) ?? 0,
          toRealized: next ? (realized.get(next) ?? 0) : null,
          trigger: "unprofitable",
          lossCoins: kept.lossCoins,
          buyCaps: kept.buyCaps,
        });
        if (!next) {
          losses = 0;
          seatStats = emptySeat();
        }
      } else if (!copying) {
        considerSeat();
      }
      continue;
    }

    if (copying === event.buy.wallet && typeof event.buy.entryMarketCapUsd === "number" && Number.isFinite(event.buy.entryMarketCapUsd) && event.buy.entryMarketCapUsd > 0) {
      seatStats.buyCaps.push({
        coin: coinOf(event.buy.symbol, event.buy.coinName, event.buy.mint),
        marketCapUsd: event.buy.entryMarketCapUsd,
      });
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
    if (typeof event.buy.amountSol === "number" && Number.isFinite(event.buy.amountSol) && event.buy.amountSol > 0) {
      fill.amountSol = event.buy.amountSol;
    }
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
    switches,
    copyingStreak: copying ? seatStats.streak : 0,
    copyingLost: copying ? seatStats.lost : 0,
    skippedUnnamedBuys,
  };
}

interface SeatStats {
  losses: number;
  streak: number;
  lost: number;
  lossCoins: string[];
  buyCaps: SeatedBuyCap[];
}

function emptySeat(): SeatStats {
  return { losses: 0, streak: 0, lost: 0, lossCoins: [], buyCaps: [] };
}

function coinOf(symbol: string | undefined, name: string | undefined, mint: string | undefined): string | null {
  const id = mint ?? "";
  return cleanCoin(symbol, id) ?? cleanCoin(name, id);
}

function timeline(closed: readonly ClosedTrade[], buys: readonly BuySignal[]): BookEvent[] {
  const events: BookEvent[] = [];
  for (const trade of closed) {
    if (!Number.isFinite(tradePnl(trade))) continue;
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
