import type { RoundTrip } from "@/lib/types";

/**
 * Pump.fun's global account still starts the curve at 30 virtual SOL and
 * 1.073 billion virtual tokens, with 793.1 million tokens actually for sale
 * and a 1 billion supply. The curve is finished when those sale tokens are
 * gone. Buyers have put in about 85 SOL by then, and the market cap at that
 * print is about 410.88 SOL. The dollar line moves with SOL. Around 23 Oct
 * 2026 SOL was about $104, so graduation was about $43k. The old "$69k" figure
 * was this same curve when SOL was near $168.
 */
const VIRTUAL_SOL = 30;
const VIRTUAL_TOKENS = 1_073_000_000;
const REAL_TOKENS = 793_100_000;
const SUPPLY = 1_000_000_000;
const TOKENS_LEFT = VIRTUAL_TOKENS - REAL_TOKENS;
const VIRTUAL_SOL_AT_GRADUATION = (VIRTUAL_SOL * VIRTUAL_TOKENS) / TOKENS_LEFT;

export const GRADUATION_MCAP_SOL = (VIRTUAL_SOL_AT_GRADUATION * SUPPLY) / TOKENS_LEFT;

/**
 * The last stretch of the curve, not the middle of the launch. About 90% of
 * the SOL that completes the bond lands near 85% of the graduation market cap.
 */
export const CLOSE_BOND_RATIO = 0.85;

const MINUTE_MS = 60_000;

/**
 * The earlier window has to be a live tape. A few quiet prints are not hype fading.
 */
const ACTIVE_WINDOW_USD = 1_000;

export interface VolumeCandle {
  /** Candle open, in milliseconds. */
  t: number;
  /** Volume in dollars. */
  v: number;
}

export function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

export function graduationMarketCapUsd(solPriceUsd: number): number {
  if (!(solPriceUsd > 0)) return 0;
  return Math.round(GRADUATION_MCAP_SOL * solPriceUsd);
}

export type BondZone = "post" | "close" | "below" | "unknown";

/**
 * Post-bond: the fill paid the graduation market cap or more. The curve cannot
 * print above that line, so the coin had already migrated and the buyer was
 * still paying a late price, not a crashed one.
 * Close to bond: the fill is at least 85% of that day's graduation market cap
 * and still under it, which is the curve nearly full.
 * A later buy that has already fallen under that band is not close to the high.
 * No graduation line means the fill has no bond position.
 */
export function bondZone(trade: Pick<RoundTrip, "entryMarketCapUsd" | "graduationMarketCapUsd">): BondZone {
  const graduation = trade.graduationMarketCapUsd ?? 0;
  const entry = trade.entryMarketCapUsd;
  if (!(graduation > 0) || !(entry > 0)) return "unknown";
  if (entry >= graduation) return "post";
  if (entry >= graduation * CLOSE_BOND_RATIO) return "close";
  return "below";
}

/**
 * Volume is actively dropping when the five completed minutes before the fill
 * did at most 75% of the volume of the five minutes before that, and that
 * earlier window was a live tape. A flat or rising tape is a breakout, not
 * FOMO. Missing or gapped candles are unknown, and unknown is not FOMO.
 */
export function volumeFallingAt(candles: VolumeCandle[], entryMs: number): boolean | undefined {
  if (!Number.isFinite(entryMs)) return undefined;
  const byOpen = new Map<number, number>();
  for (const candle of candles) {
    if (!Number.isFinite(candle.t) || !Number.isFinite(candle.v) || candle.v < 0) continue;
    byOpen.set(candle.t, Math.max(byOpen.get(candle.t) ?? 0, candle.v));
  }
  const complete = [...byOpen.entries()]
    .map(([t, v]) => ({ t, v }))
    .filter((candle) => candle.t + MINUTE_MS <= entryMs)
    .sort((left, right) => left.t - right.t);
  if (complete.length < 10) return undefined;
  const last = complete[complete.length - 1];
  if (entryMs - (last.t + MINUTE_MS) > 2 * MINUTE_MS) return undefined;
  const tail = complete.slice(-10);
  for (let index = 1; index < tail.length; index += 1) {
    if (tail[index].t - tail[index - 1].t !== MINUTE_MS) return undefined;
  }
  const prior = tail.slice(0, 5).reduce((sum, candle) => sum + candle.v, 0);
  const recent = tail.slice(5).reduce((sum, candle) => sum + candle.v, 0);
  if (prior < ACTIVE_WINDOW_USD) return false;
  return recent <= prior * 0.75 && recent < prior;
}

export type FomoStatus = "yes" | "no" | "unknown";

/**
 * FOMO is both, not either. The fill is post-bond or close to the bond, and
 * volume was falling when it was bought. Percent of the daily high is not a
 * FOMO rule. A missing bond line or a missing volume read stays unknown.
 */
export function fomoStatus(trade: Pick<RoundTrip, "entryMarketCapUsd" | "graduationMarketCapUsd" | "volumeFalling">): FomoStatus {
  const zone = bondZone(trade);
  if (zone === "unknown") return "unknown";
  if (zone === "below") return "no";
  if (trade.volumeFalling === true) return "yes";
  if (trade.volumeFalling === false) return "no";
  return "unknown";
}
