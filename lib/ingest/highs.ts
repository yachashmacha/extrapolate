import { readFileSync, writeFileSync } from "node:fs";
import { coinStatsFromTape, verifiedTape, type DailyHigh, type PoolCandle, type VerifiedTape } from "@/lib/analysis/coin-stats";
import type { MintMeta } from "@/lib/ingest/round-trips";

const CACHE_PATH = "/tmp/extrapolate-ath.json";

interface HighTarget {
  pairAddress: string;
  supply: number;
  liquidity: number;
}

const memory = new Map<string, VerifiedTape>();
const targets = new Map<string, HighTarget>();
const pending = new Map<string, Promise<void>>();
let active = 0;
const queue: Array<() => void> = [];
let diskTimer: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

function loadDisk(): void {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, VerifiedTape | number>;
    for (const [mint, value] of Object.entries(parsed)) {
      const tape = tapeFromDisk(value);
      if (tape) memory.set(mint, tape);
    }
  } catch {
    // The first read of a wallet fills this file.
  }
}

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

function pump(run: () => void): void {
  if (active < 4) {
    active += 1;
    run();
    return;
  }
  queue.push(run);
}

function release(): void {
  active -= 1;
  const next = queue.shift();
  if (!next) return;
  active += 1;
  next();
}

export function noteMints(metas: Map<string, MintMeta>): void {
  loadDisk();
  for (const [mint, meta] of metas) {
    if (!meta.pairAddress || meta.supply <= 0) continue;
    targets.set(mint, { pairAddress: meta.pairAddress, supply: meta.supply, liquidity: meta.liquidityUsd });
  }
}

export function startHighs(mints: string[]): void {
  loadDisk();
  for (const mint of mints) void ensureMint(mint);
}

export async function highsFor(mints: string[]): Promise<Record<string, VerifiedTape>> {
  loadDisk();
  await resolveTargets(mints.filter((mint) => !targets.has(mint) && !Array.isArray(memory.get(mint)?.bars)));
  await Promise.all(mints.map((mint) => ensureMint(mint)));
  const tapes: Record<string, VerifiedTape> = {};
  for (const mint of mints) {
    const tape = memory.get(mint);
    if (tape) tapes[mint] = tape;
  }
  return tapes;
}

async function resolveTargets(mints: string[]): Promise<void> {
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
        if (!mint) continue;
        const price = Number(pair.priceUsd ?? 0);
        const fdv = Number(pair.fdv ?? 0);
        const marketCap = Number(pair.marketCap ?? 0);
        const supply = price > 0 ? (fdv > 0 ? fdv : marketCap) / price : 0;
        const liquidity = Number(pair.liquidity?.usd ?? 0);
        if (!pair.pairAddress || !(supply > 0)) continue;
        const current = targets.get(mint);
        if (current && current.liquidity >= liquidity) continue;
        targets.set(mint, { pairAddress: pair.pairAddress, supply, liquidity });
      }
    } catch {
      // Highs for this chunk wait until the next read.
    }
  }
}

interface DexRow {
  baseToken?: { address?: string };
  pairAddress?: string;
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
}

function ensureMint(mint: string): Promise<void> {
  const existing = pending.get(mint);
  if (existing) return existing;
  if (Array.isArray(memory.get(mint)?.bars)) return Promise.resolve();
  const target = targets.get(mint);
  if (!target) return Promise.resolve();
  const job = new Promise<void>((resolve) => {
    pump(() => {
      readHigh(mint, target)
        .catch(() => undefined)
        .finally(() => {
          pending.delete(mint);
          release();
          resolve();
        });
    });
  });
  pending.set(mint, job);
  return job;
}

async function readHigh(mint: string, target: HighTarget): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${target.pairAddress}/ohlcv/day?aggregate=1&limit=1000&currency=usd&token=base`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { accept: "application/json", "user-agent": "extrapolate" },
      },
    );
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      continue;
    }
    if (!response.ok) return;
    const body = (await response.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    const rows = body.data?.attributes?.ohlcv_list;
    if (!Array.isArray(rows) || rows.length === 0) return;
    const candles: PoolCandle[] = [];
    for (const row of rows) {
      const t = Number(row?.[0]) * 1000;
      const high = Number(row?.[2]);
      const close = Number(row?.[4]);
      const volume = Number(row?.[5]);
      if (!Number.isFinite(t) || t <= 0) continue;
      if (!Number.isFinite(volume) || volume < 0) continue;
      if (!Number.isFinite(close) || close <= 0) continue;
      candles.push({ t, v: volume, c: close, h: Number.isFinite(high) && high > 0 ? high : undefined });
    }
    const tape = verifiedTape(
      coinStatsFromTape({
        life: candles,
        supply: target.supply,
        windowCapped: rows.length >= 1000,
      }),
    );
    if (!tape) return;
    memory.set(mint, tape);
    scheduleDisk();
    return;
  }
}

function readBars(value: unknown): DailyHigh[] | null {
  if (!Array.isArray(value)) return null;
  const bars: DailyHigh[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const bar = row as DailyHigh;
    const t = Number(bar.t);
    const highUsd = Number(bar.highUsd);
    if (t > 0 && highUsd > 0) bars.push({ t, highUsd });
  }
  return bars;
}

/** A bare number from the old cache is a high with no tape. It is not reused. */
function tapeFromDisk(value: VerifiedTape | number): VerifiedTape | null {
  if (!value || typeof value === "number") return null;
  const volume = typeof value.volumeUsd === "number" && Number.isFinite(value.volumeUsd) && value.volumeUsd >= 0 ? value.volumeUsd : null;
  const count = typeof value.candleCount === "number" && value.candleCount > 0 ? value.candleCount : 0;
  const from = typeof value.fromMs === "number" && value.fromMs > 0 ? value.fromMs : null;
  const to = typeof value.toMs === "number" && value.toMs > 0 ? value.toMs : null;
  const bars = readBars(value.bars);
  const dated = bars != null;
  const high = dated && typeof value.highMarketCapUsd === "number" && value.highMarketCapUsd > 0 ? value.highMarketCapUsd : null;
  const hasVolume = volume != null && count > 0 && from != null && to != null;
  if (!hasVolume && high == null && !dated) return null;
  return {
    highMarketCapUsd: high,
    bars: bars ?? undefined,
    volumeUsd: hasVolume ? volume : null,
    candleCount: hasVolume ? count : 0,
    fromMs: hasVolume ? from : null,
    toMs: hasVolume ? to : null,
    windowCapped: hasVolume ? Boolean(value.windowCapped) : false,
    firstMarketCapUsd: hasVolume && typeof value.firstMarketCapUsd === "number" && value.firstMarketCapUsd > 0 ? value.firstMarketCapUsd : null,
    lastMarketCapUsd: hasVolume && typeof value.lastMarketCapUsd === "number" && value.lastMarketCapUsd > 0 ? value.lastMarketCapUsd : null,
  };
}
