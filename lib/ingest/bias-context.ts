import { readFileSync, writeFileSync } from "node:fs";
import { bondZone, graduationMarketCapUsd, isPumpMint, volumeFallingAt, type VolumeCandle } from "@/lib/analysis/fomo";

export interface BiasTrade {
  id: string;
  mint: string;
  entryAt: string;
  entryMarketCapUsd: number;
}

export interface BiasRead {
  graduationMarketCapUsd?: number;
  volumeFalling?: boolean;
}

interface PairHit {
  pairAddress: string;
  liquidityUsd: number;
  createdAt: number;
}

const CACHE_PATH = "/tmp/extrapolate-volume.json";
const memory = new Map<string, VolumeCandle[]>();
let diskLoaded = false;
let solPrices: [number, number][] | null = null;
let solLoadedAt = 0;

export async function biasContextFor(trades: BiasTrade[]): Promise<Record<string, BiasRead>> {
  const reads: Record<string, BiasRead> = {};
  const prices = await loadSolPrices();
  const needsVolume: BiasTrade[] = [];
  for (const trade of trades) {
    if (!isPumpMint(trade.mint)) continue;
    const sol = priceAt(prices, trade.entryAt);
    const graduation = graduationMarketCapUsd(sol);
    if (!(graduation > 0)) continue;
    const read: BiasRead = { graduationMarketCapUsd: graduation };
    reads[trade.id] = read;
    const zone = bondZone({ entryMarketCapUsd: trade.entryMarketCapUsd, graduationMarketCapUsd: graduation });
    if (zone === "post" || zone === "close") needsVolume.push(trade);
  }
  if (needsVolume.length === 0) return reads;

  const pairs = await loadPairs([...new Set(needsVolume.map((trade) => trade.mint))]);
  const byPair = new Map<string, BiasTrade[]>();
  for (const trade of needsVolume) {
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
          const read = reads[trade.id];
          const falling = volumeFallingAt(candles, Date.parse(trade.entryAt));
          if (read && typeof falling === "boolean") read.volumeFalling = falling;
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

async function candlesFor(pair: string, trades: BiasTrade[]): Promise<VolumeCandle[]> {
  loadDisk();
  const times = trades.map((trade) => Date.parse(trade.entryAt)).filter((time) => Number.isFinite(time));
  if (times.length === 0) return memory.get(pair) ?? [];
  const newest = Math.max(...times);
  const oldest = Math.min(...times) - 20 * 60_000;
  let have = memory.get(pair) ?? [];
  if (covers(have, oldest, newest)) return have;
  let before = Math.ceil(newest / 1000) + 120;
  for (let page = 0; page < 4; page += 1) {
    const batch = await fetchCandles(pair, before);
    if (!batch || batch.length === 0) break;
    have = mergeCandles(have, batch);
    const earliest = Math.min(...batch.map((candle) => candle.t));
    if (earliest <= oldest) break;
    before = Math.floor(earliest / 1000);
  }
  memory.set(pair, have);
  scheduleDisk();
  return have;
}

function covers(candles: VolumeCandle[], oldest: number, newest: number): boolean {
  if (candles.length === 0) return false;
  const times = candles.map((candle) => candle.t);
  return Math.min(...times) <= oldest && Math.max(...times) >= newest - 15 * 60_000;
}

async function fetchCandles(pair: string, beforeSec: number): Promise<VolumeCandle[] | null> {
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
      const candles: VolumeCandle[] = [];
      for (const row of rows) {
        const t = Number(row?.[0]) * 1000;
        const v = Number(row?.[5]);
        if (Number.isFinite(t) && t > 0 && Number.isFinite(v) && v >= 0) candles.push({ t, v });
      }
      return candles;
    } catch {
      return null;
    }
  }
  return null;
}

function mergeCandles(left: VolumeCandle[], right: VolumeCandle[]): VolumeCandle[] {
  const byOpen = new Map<number, number>();
  for (const candle of [...left, ...right]) byOpen.set(candle.t, Math.max(byOpen.get(candle.t) ?? 0, candle.v));
  return [...byOpen.entries()]
    .map(([t, v]) => ({ t, v }))
    .sort((a, b) => a.t - b.t);
}

async function loadSolPrices(): Promise<[number, number][]> {
  if (solPrices && Date.now() - solLoadedAt < 10 * 60_000) return solPrices;
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=90", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json" },
    });
    if (response.ok) {
      const body = (await response.json()) as { prices?: [number, number][] };
      const prices = (body.prices ?? []).filter((row) => row.length === 2 && row[1] > 0);
      if (prices.length > 0) {
        solPrices = prices;
        solLoadedAt = Date.now();
        return prices;
      }
    }
  } catch {
    // A missed chart leaves the graduation line unread.
  }
  return solPrices ?? [];
}

function priceAt(prices: [number, number][], iso: string): number {
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || prices.length === 0) return 0;
  let nearest = prices[0];
  let best = Infinity;
  for (const row of prices) {
    const gap = Math.abs(row[0] - time);
    if (gap < best) {
      best = gap;
      nearest = row;
    }
  }
  return nearest[1] || 0;
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
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, VolumeCandle[]>;
    for (const [pair, candles] of Object.entries(parsed)) {
      if (Array.isArray(candles)) memory.set(pair, candles.filter((candle) => candle && candle.t > 0 && candle.v >= 0));
    }
  } catch {
    // The first volume read fills this file.
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
