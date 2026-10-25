import { readFileSync, writeFileSync } from "node:fs";
import { fadeAfterEntry, type TapeCandle } from "@/lib/analysis/fomo";

export interface BiasTrade {
  id: string;
  mint: string;
  entryAt: string;
  entryMarketCapUsd: number;
}

export interface BiasRead {
  volumeDroppedAfter?: boolean;
  mcDroppedAfter?: boolean;
}

interface PairHit {
  pairAddress: string;
  liquidityUsd: number;
  createdAt: number;
}

interface PairCache {
  candles: TapeCandle[];
  /** The post-entry window is covered through this millisecond. */
  throughMs: number;
}

const CACHE_PATH = "/tmp/extrapolate-fade.json";
const memory = new Map<string, PairCache>();
let diskLoaded = false;

/**
 * Reads the minutes after each fill. Market cap is not a gate: a pool is enough.
 * A fill whose volume or close cannot be read is left out, and that fill is not FOMO.
 */
export async function biasContextFor(trades: BiasTrade[]): Promise<Record<string, BiasRead>> {
  const reads: Record<string, BiasRead> = {};
  const wanted = trades.filter((trade) => trade.mint && trade.entryAt);
  if (wanted.length === 0) return reads;

  const pairs = await loadPairs([...new Set(wanted.map((trade) => trade.mint))]);
  const byPair = new Map<string, BiasTrade[]>();
  for (const trade of wanted) {
    const pair = pickPair(pairs.get(trade.mint) ?? [], Date.parse(trade.entryAt));
    if (!pair) continue;
    const list = byPair.get(pair) ?? [];
    list.push(trade);
    byPair.set(pair, list);
  }
  await Promise.all(
    [...byPair.entries()].map(([pair, group]) =>
      paced(async () => {
        const candles = await candlesFor(pair, group);
        for (const trade of group) {
          const fade = fadeAfterEntry(candles, Date.parse(trade.entryAt));
          if (typeof fade.volumeDroppedAfter !== "boolean" || typeof fade.mcDroppedAfter !== "boolean") continue;
          reads[trade.id] = {
            volumeDroppedAfter: fade.volumeDroppedAfter,
            mcDroppedAfter: fade.mcDroppedAfter,
          };
        }
      }),
    ),
  );
  return reads;
}

function pickPair(pairs: PairHit[], entryMs: number): string | null {
  if (pairs.length === 0) return null;
  const live = pairs.filter((pair) => pair.createdAt > 0 && pair.createdAt <= entryMs);
  const pool = (live.length > 0 ? live : pairs).sort((left, right) => right.liquidityUsd - left.liquidityUsd)[0];
  return pool?.pairAddress ?? null;
}

async function loadPairs(mints: string[]): Promise<Map<string, PairHit[]>> {
  const map = new Map<string, PairHit[]>();
  for (let offset = 0; offset < mints.length; offset += 30) {
    const chunk = mints.slice(offset, offset + 30);
    if (chunk.length === 0) continue;
    try {
      const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
        headers: { accept: "application/json", "user-agent": "extrapolate" },
      });
      if (!response.ok) continue;
      const body = (await response.json()) as DexRow[] | { pairs?: DexRow[] };
      const pairs = Array.isArray(body) ? body : body.pairs ?? [];
      for (const pair of pairs) {
        const mint = pair.baseToken?.address;
        if (!mint || !pair.pairAddress) continue;
        const list = map.get(mint) ?? [];
        list.push({
          pairAddress: pair.pairAddress,
          liquidityUsd: Number(pair.liquidity?.usd ?? 0),
          createdAt: createdMs(Number(pair.pairCreatedAt ?? 0)),
        });
        map.set(mint, list);
      }
    } catch {
      // This chunk stays without a pool. Those fills are not labeled FOMO.
    }
  }
  return map;
}

async function candlesFor(pair: string, trades: BiasTrade[]): Promise<TapeCandle[]> {
  loadDisk();
  const times = trades.map((trade) => Date.parse(trade.entryAt)).filter((time) => Number.isFinite(time));
  if (times.length === 0) return memory.get(pair)?.candles ?? [];
  const oldest = Math.min(...times) - 60_000;
  const newest = Math.max(...times) + 10 * 60_000;
  const cached = memory.get(pair);
  if (cached && cached.throughMs >= newest && (cached.candles.length === 0 || Math.min(...cached.candles.map((candle) => candle.t)) <= oldest)) {
    return cached.candles;
  }
  let have = cached?.candles ?? [];
  let before = Math.ceil(newest / 1000) + 60;
  let complete = false;
  for (let page = 0; page < 4; page += 1) {
    const batch = await fetchCandles(pair, before);
    if (!batch) break;
    have = mergeCandles(have, batch);
    if (batch.length < 1000) {
      complete = true;
      break;
    }
    const earliest = Math.min(...batch.map((candle) => candle.t));
    if (earliest <= oldest) {
      complete = true;
      break;
    }
    before = Math.floor(earliest / 1000);
  }
  memory.set(pair, { candles: have, throughMs: complete ? newest : cached?.throughMs ?? 0 });
  scheduleDisk();
  return have;
}

async function fetchCandles(pair: string, beforeSec: number): Promise<TapeCandle[] | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pair}/ohlcv/minute?aggregate=1&limit=1000&before_timestamp=${beforeSec}&currency=usd&token=base`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
          headers: { accept: "application/json", "user-agent": "extrapolate" },
        },
      );
      if (response.status === 429) {
        await wait(700 * (attempt + 1));
        continue;
      }
      if (!response.ok) return null;
      const body = (await response.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
      const rows = body.data?.attributes?.ohlcv_list;
      if (!Array.isArray(rows)) return null;
      const candles: TapeCandle[] = [];
      for (const row of rows) {
        const t = Number(row?.[0]) * 1000;
        const c = Number(row?.[4]);
        const v = Number(row?.[5]);
        if (Number.isFinite(t) && t > 0 && Number.isFinite(v) && v >= 0 && Number.isFinite(c) && c > 0) {
          candles.push({ t, v, c });
        }
      }
      return candles;
    } catch {
      return null;
    }
  }
  return null;
}

function mergeCandles(left: TapeCandle[], right: TapeCandle[]): TapeCandle[] {
  const byOpen = new Map<number, TapeCandle>();
  for (const candle of [...left, ...right]) {
    const prev = byOpen.get(candle.t);
    if (!prev || candle.v >= prev.v) byOpen.set(candle.t, candle);
  }
  return [...byOpen.values()].sort((a, b) => a.t - b.t);
}

function createdMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value < 1e12 ? value * 1000 : value;
}

interface DexRow {
  baseToken?: { address?: string };
  pairAddress?: string;
  pairCreatedAt?: number;
  liquidity?: { usd?: number };
}

let active = 0;
const queue: Array<() => void> = [];

function paced(job: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const run = () => {
      active += 1;
      job()
        .catch(() => undefined)
        .finally(() => {
          active -= 1;
          const next = queue.shift();
          if (next) next();
          resolve();
        });
    };
    if (active < 3) run();
    else queue.push(run);
  });
}

function loadDisk(): void {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, PairCache>;
    for (const [pair, cache] of Object.entries(parsed)) {
      if (!cache || !Array.isArray(cache.candles)) continue;
      const candles = cache.candles.filter((candle) => candle && candle.t > 0 && candle.v >= 0 && candle.c > 0);
      memory.set(pair, { candles, throughMs: Number(cache.throughMs) || 0 });
    }
  } catch {
    // The first fade read fills this file.
  }
}

let diskTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleDisk(): void {
  if (diskTimer) return;
  diskTimer = setTimeout(() => {
    diskTimer = null;
    try {
      writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(memory)));
    } catch {
      // A missed write only means the next boot rereads the pools.
    }
  }, 400);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
