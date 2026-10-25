import type { RoundTrip } from "@/lib/types";

/**
 * FOMO is the fade after the fill, at any market cap.
 *
 * The trader's correction: a buy is not FOMO because it was near the pump.fun
 * bond, and a buy is not spared because it was cheap. Being near graduation is
 * neither required nor sufficient. The five minutes before the fill are not
 * the definition either. What matters is what the tape did after the entry.
 *
 * Both of these have to be true, and both have to be readable:
 *   volume started dropping after the buy
 *   market cap also dropped after the buy
 * If either one cannot be read, the fill is not FOMO. If volume kept rising,
 * or market cap kept climbing, the fill is not FOMO.
 *
 * Minute candles are the resolution we have. Gecko omits minutes with no
 * trades, so a missing minute is a gap, not a zero, and it is not filled in.
 * The entry minute is the minute the fill landed in. Its close stands in for
 * market cap, because supply does not change between these prints. The read
 * stops ten minutes after that minute: that is the tape the entry just bought
 * into. A dump an hour later is a different event, and it is not this label.
 */
const MINUTE_MS = 60_000;
const AFTER_MINUTES = 10;

export interface TapeCandle {
  /** Candle open, in milliseconds. */
  t: number;
  /** Volume in dollars. */
  v: number;
  /** Close price in dollars. Market cap moves with this print. */
  c: number;
}

export interface FadeRead {
  volumeDroppedAfter?: boolean;
  mcDroppedAfter?: boolean;
}

/**
 * Volume started dropping when the minutes after the entry average strictly
 * under the entry minute, and the later of those minutes did not turn back up
 * over the earlier ones. A flat or rising post-entry tape kept its volume.
 * Market cap dropped when the last of those closes is strictly under the entry
 * minute's close. Flat or higher means the market cap did not drop.
 * The entry candle plus two later candles inside the window are the minimum
 * that can show a fade. Anything short of that stays unread.
 */
export function fadeAfterEntry(candles: TapeCandle[], entryMs: number): FadeRead {
  if (!Number.isFinite(entryMs)) return {};
  const entryOpen = Math.floor(entryMs / MINUTE_MS) * MINUTE_MS;
  const byOpen = new Map<number, TapeCandle>();
  for (const candle of candles) {
    if (!Number.isFinite(candle.t) || !Number.isFinite(candle.v) || candle.v < 0) continue;
    if (!Number.isFinite(candle.c) || candle.c <= 0) continue;
    const prev = byOpen.get(candle.t);
    if (!prev || candle.v >= prev.v) byOpen.set(candle.t, candle);
  }
  const entry = byOpen.get(entryOpen);
  if (!entry) return {};
  const after = [...byOpen.values()]
    .filter((candle) => candle.t > entryOpen && candle.t <= entryOpen + AFTER_MINUTES * MINUTE_MS)
    .sort((left, right) => left.t - right.t);
  if (after.length < 2) return {};
  const span = Math.floor(after.length / 2);
  const early = after.slice(0, span);
  const late = after.slice(after.length - span);
  const postAvg = average(after.map((candle) => candle.v));
  const earlyAvg = average(early.map((candle) => candle.v));
  const lateAvg = average(late.map((candle) => candle.v));
  const last = after[after.length - 1];
  return {
    volumeDroppedAfter: postAvg < entry.v && lateAvg <= earlyAvg,
    mcDroppedAfter: last.c < entry.c,
  };
}

export type FomoStatus = "yes" | "no" | "unknown";

/**
 * Yes only when volume started dropping after the entry and market cap dropped
 * too. No when both were read and either one failed. Unknown when either read
 * is missing. Unknown is not FOMO. The fill's own market cap is not an input.
 */
export function fomoStatus(trade: Pick<RoundTrip, "volumeDroppedAfter" | "mcDroppedAfter">): FomoStatus {
  const volume = trade.volumeDroppedAfter;
  const mc = trade.mcDroppedAfter;
  if (typeof volume !== "boolean" || typeof mc !== "boolean") return "unknown";
  if (volume && mc) return "yes";
  return "no";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
