import { fadeAfterEntry, fomoStatus, type FomoStatus, type TapeCandle } from "@/lib/analysis/fomo";
import { fmtCoin } from "@/lib/format";
import type { RoundTrip } from "@/lib/types";

/**
 * One pool candle the app fetched for a single mint.
 * Volume is dollars. Close and high are token prices in dollars.
 * A missing high is not filled in from the close.
 */
export interface PoolCandle {
  t: number;
  v: number;
  c: number;
  h?: number;
}

export interface PricePath {
  first: number;
  last: number;
  fromMs: number;
  toMs: number;
}

/** One daily high, in market cap. `t` is the candle open. */
export interface DailyHigh {
  t: number;
  highUsd: number;
}

const DAY_MS = 86_400_000;

export interface CoinStats {
  volumeUsd: number | null;
  candleCount: number;
  fromMs: number | null;
  toMs: number | null;
  windowCapped: boolean;
  pricePath: PricePath | null;
  /** Highest daily high on the fetched tape. This is not "what it ran to" after a fill. */
  highMarketCapUsd: number | null;
  /** Each daily high, so a fill can ignore a peak from before the entry. */
  bars: DailyHigh[];
  firstMarketCapUsd: number | null;
  lastMarketCapUsd: number | null;
  /** Fill price times fetched supply. Null when either input was not read. */
  entryMarketCapUsd: number | null;
  exitMarketCapUsd: number | null;
  volumeDroppedAfter?: boolean;
  mcDroppedAfter?: boolean;
  fomo: FomoStatus;
}

export interface VerifiedTape {
  highMarketCapUsd: number | null;
  /** Daily highs in market cap. Absent on a tape that was saved before they were kept. */
  bars?: DailyHigh[];
  volumeUsd: number | null;
  candleCount: number;
  fromMs: number | null;
  toMs: number | null;
  windowCapped: boolean;
  firstMarketCapUsd: number | null;
  lastMarketCapUsd: number | null;
}

/**
 * Stats for one mint from the candles, supply, and fill prices that were passed in.
 * Nothing here is estimated. An empty tape does not become a zero volume, a flat
 * price path, a market cap, or a FOMO label. Post-entry candles are not copied
 * onto the life tape, and the life tape is not used as the post-entry read.
 */
export function coinStatsFromTape(input: {
  life?: PoolCandle[] | null;
  supply?: number | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  entryMs?: number | null;
  postEntry?: PoolCandle[] | null;
  windowCapped?: boolean;
}): CoinStats {
  const life = deduped(input.life);
  const supply = positive(input.supply);
  const highPrice = maxHigh(life);
  const bars = dailyHighs(life, supply);
  const first = life[0];
  const last = life[life.length - 1];
  const volumeUsd = life.length > 0 ? sum(life.map((candle) => candle.v)) : null;
  const pricePath =
    life.length >= 2 && first && last
      ? { first: first.c, last: last.c, fromMs: first.t, toMs: last.t }
      : null;
  const fade = fadeAfterEntry(asTape(input.postEntry), input.entryMs ?? Number.NaN);
  return {
    volumeUsd,
    candleCount: life.length,
    fromMs: first?.t ?? null,
    toMs: last?.t ?? null,
    windowCapped: Boolean(input.windowCapped) && life.length > 0,
    pricePath,
    highMarketCapUsd: supply != null && highPrice != null ? dollars(highPrice * supply) : null,
    bars,
    firstMarketCapUsd: supply != null && first ? dollars(first.c * supply) : null,
    lastMarketCapUsd: supply != null && last && life.length >= 2 ? dollars(last.c * supply) : null,
    entryMarketCapUsd: cap(input.entryPrice, supply),
    exitMarketCapUsd: cap(input.exitPrice, supply),
    volumeDroppedAfter: fade.volumeDroppedAfter,
    mcDroppedAfter: fade.mcDroppedAfter,
    fomo: fomoStatus(fade),
  };
}

export function verifiedTape(stats: CoinStats): VerifiedTape | null {
  const hasHigh = stats.highMarketCapUsd != null && stats.highMarketCapUsd > 0;
  const hasVolume = stats.volumeUsd != null && stats.candleCount > 0 && stats.fromMs != null && stats.toMs != null;
  if (!hasHigh && !hasVolume) return null;
  return {
    highMarketCapUsd: hasHigh ? stats.highMarketCapUsd : null,
    bars: stats.bars,
    volumeUsd: hasVolume ? stats.volumeUsd : null,
    candleCount: hasVolume ? stats.candleCount : 0,
    fromMs: hasVolume ? stats.fromMs : null,
    toMs: hasVolume ? stats.toMs : null,
    windowCapped: hasVolume ? stats.windowCapped : false,
    firstMarketCapUsd: hasVolume ? stats.firstMarketCapUsd : null,
    lastMarketCapUsd: hasVolume ? stats.lastMarketCapUsd : null,
  };
}

/** The tape stored for this mint, or null. Never a neighbor mint's tape. */
export function tapeForMint(tapes: Record<string, VerifiedTape> | null | undefined, mint: string): VerifiedTape | null {
  if (!tapes || !mint) return null;
  return tapes[mint] ?? null;
}

/**
 * The high after this entry: the best daily high on a candle that was still
 * open at the fill, or that opened later. A daily candle that had already
 * closed is not what the coin ran to after the buy. Daily resolution is the
 * tape we have, so the high of the entry's own day can include earlier prints
 * that same day. Missing bars omit the claim.
 */
export function highSinceEntry(bars: DailyHigh[] | null | undefined, entryMs: number): number | null {
  if (!bars || !Number.isFinite(entryMs)) return null;
  let high = 0;
  for (const bar of bars) {
    if (!Number.isFinite(bar.t) || !(bar.highUsd > 0)) continue;
    if (bar.t + DAY_MS <= entryMs) continue;
    if (bar.highUsd > high) high = bar.highUsd;
  }
  return high > 0 ? dollars(high) : null;
}

/**
 * Copy a verified tape onto this trade. A missing tape does not invent volume,
 * a price path, or a high. A read that came back without a high drops a stale one.
 * When the tape has dated daily highs, the trade keeps the high at or after its
 * entry. The mint's highest print is not copied onto a fill that bought later.
 */
export function applyVerifiedTape<T extends RoundTrip>(trade: T, tape: VerifiedTape | null | undefined): T {
  if (!tape) return trade;
  let next: T = trade;
  if (tape.bars && tape.bars.length > 0) {
    const since = highSinceEntry(tape.bars, Date.parse(trade.entryAt));
    if (since != null && since > 0) {
      if (since !== next.athMarketCapUsd) next = { ...next, athMarketCapUsd: since };
    } else if (next.athMarketCapUsd != null) {
      next = stripHigh(next);
    }
  } else if (tape.candleCount > 0 && !(tape.highMarketCapUsd != null && tape.highMarketCapUsd > 0)) {
    if (next.athMarketCapUsd != null) next = stripHigh(next);
  } else if (tape.highMarketCapUsd != null && tape.highMarketCapUsd > 0 && tape.highMarketCapUsd !== next.athMarketCapUsd) {
    next = { ...next, athMarketCapUsd: tape.highMarketCapUsd };
  }
  if (tape.volumeUsd == null || !(tape.candleCount > 0) || tape.fromMs == null || tape.toMs == null) {
    return clearLife(next);
  }
  return {
    ...next,
    lifeVolumeUsd: tape.volumeUsd,
    lifeCandleCount: tape.candleCount,
    lifeFromMs: tape.fromMs,
    lifeToMs: tape.toMs,
    lifeWindowCapped: tape.windowCapped,
    poolCloseFromUsd: tape.candleCount >= 2 && tape.firstMarketCapUsd != null && tape.firstMarketCapUsd > 0 ? tape.firstMarketCapUsd : undefined,
    poolCloseToUsd: tape.candleCount >= 2 && tape.lastMarketCapUsd != null && tape.lastMarketCapUsd > 0 ? tape.lastMarketCapUsd : undefined,
  };
}

export function copyVerifiedTape<T extends RoundTrip>(trade: T, source: RoundTrip | undefined): T {
  if (!source || source.mint !== trade.mint) return trade;
  return applyVerifiedTape(trade, tapeFromTrade(source));
}

/** Words for the fetched daily tape. Null when the tape was not read. */
export function describeVerifiedTape(trade: Pick<
  RoundTrip,
  "lifeVolumeUsd" | "lifeCandleCount" | "lifeFromMs" | "lifeToMs" | "lifeWindowCapped" | "poolCloseFromUsd" | "poolCloseToUsd"
>): string | null {
  const volume = trade.lifeVolumeUsd;
  const count = trade.lifeCandleCount ?? 0;
  const from = trade.lifeFromMs;
  const to = trade.lifeToMs;
  if (volume == null || !(count > 0) || from == null || to == null) return null;
  const money = fmtCoin(volume);
  if (money === "—") return null;
  if (count === 1) {
    return `Volume ${money} on the daily candle ${utcDay(from)}.`;
  }
  const span = trade.lifeWindowCapped ? `the latest ${count} daily candles` : `${count} daily candles`;
  const window = `${utcDay(from)}–${utcDay(to)}`;
  let line = `Volume ${money} across ${span}, ${window}.`;
  const fromMc = trade.poolCloseFromUsd;
  const toMc = trade.poolCloseToUsd;
  if (fromMc != null && fromMc > 0 && toMc != null && toMc > 0) {
    line += ` Pool close went from ${fmtCoin(fromMc)} to ${fmtCoin(toMc)} on those candles.`;
  }
  return line;
}

function tapeFromTrade(trade: RoundTrip): VerifiedTape | null {
  if (trade.lifeVolumeUsd == null && !(trade.athMarketCapUsd != null && trade.athMarketCapUsd > 0)) return null;
  return {
    highMarketCapUsd: trade.athMarketCapUsd != null && trade.athMarketCapUsd > 0 ? trade.athMarketCapUsd : null,
    volumeUsd: trade.lifeVolumeUsd ?? null,
    candleCount: trade.lifeCandleCount ?? 0,
    fromMs: trade.lifeFromMs ?? null,
    toMs: trade.lifeToMs ?? null,
    windowCapped: Boolean(trade.lifeWindowCapped),
    firstMarketCapUsd: trade.poolCloseFromUsd ?? null,
    lastMarketCapUsd: trade.poolCloseToUsd ?? null,
  };
}

function clearLife<T extends RoundTrip>(trade: T): T {
  if (
    trade.lifeVolumeUsd == null &&
    trade.lifeCandleCount == null &&
    trade.poolCloseFromUsd == null &&
    trade.poolCloseToUsd == null
  ) {
    return trade;
  }
  const { lifeVolumeUsd: _v, lifeCandleCount: _c, lifeFromMs: _f, lifeToMs: _t, lifeWindowCapped: _w, poolCloseFromUsd: _a, poolCloseToUsd: _b, ...rest } = trade;
  return rest as T;
}

function deduped(candles: PoolCandle[] | null | undefined): PoolCandle[] {
  const byOpen = new Map<number, PoolCandle>();
  for (const candle of candles ?? []) {
    if (!Number.isFinite(candle.t) || candle.t <= 0) continue;
    if (!Number.isFinite(candle.v) || candle.v < 0) continue;
    if (!Number.isFinite(candle.c) || candle.c <= 0) continue;
    const high = candle.h != null && Number.isFinite(candle.h) && candle.h > 0 ? candle.h : undefined;
    const next = { t: candle.t, v: candle.v, c: candle.c, h: high };
    const prev = byOpen.get(candle.t);
    if (!prev || next.v >= prev.v) byOpen.set(candle.t, next);
  }
  return [...byOpen.values()].sort((left, right) => left.t - right.t);
}

function asTape(candles: PoolCandle[] | null | undefined): TapeCandle[] {
  const out: TapeCandle[] = [];
  for (const candle of candles ?? []) {
    if (!Number.isFinite(candle.t) || !Number.isFinite(candle.v) || candle.v < 0) continue;
    if (!Number.isFinite(candle.c) || candle.c <= 0) continue;
    out.push({ t: candle.t, v: candle.v, c: candle.c });
  }
  return out;
}

function maxHigh(candles: PoolCandle[]): number | null {
  let high = 0;
  for (const candle of candles) {
    if (candle.h != null && candle.h > high) high = candle.h;
  }
  return high > 0 ? high : null;
}

function dailyHighs(candles: PoolCandle[], supply: number | null): DailyHigh[] {
  if (supply == null) return [];
  const bars: DailyHigh[] = [];
  for (const candle of candles) {
    if (candle.h == null || !(candle.h > 0)) continue;
    bars.push({ t: candle.t, highUsd: dollars(candle.h * supply) });
  }
  return bars;
}

function stripHigh<T extends RoundTrip>(trade: T): T {
  if (trade.athMarketCapUsd == null) return trade;
  const { athMarketCapUsd: _stale, ...rest } = trade;
  return rest as T;
}

function cap(price: number | null | undefined, supply: number | null): number | null {
  if (supply == null || !Number.isFinite(price ?? Number.NaN) || !(price! > 0)) return null;
  return dollars(price! * supply);
}

function positive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function dollars(value: number): number {
  return Math.round(value * 100) / 100;
}

function utcDay(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}
