import { readFileSync, writeFileSync } from "node:fs";
import type { MintMeta } from "@/lib/ingest/round-trips";

const CACHE_PATH = "/tmp/extrapolate-ath.json";

interface HighTarget {
  pairAddress: string;
  supply: number;
  liquidity: number;
}

const memory = new Map<string, number>();
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
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, number>;
    for (const [mint, value] of Object.entries(parsed)) {
      if (typeof value === "number" && value > 0) memory.set(mint, value);
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
    const cached = memory.get(mint);
    if (cached) meta.athMarketCapUsd = cached;
  }
}

export function startHighs(mints: string[]): void {
  loadDisk();
  for (const mint of mints) void ensureMint(mint);
}

export async function highsFor(mints: string[]): Promise<Record<string, number>> {
  loadDisk();
  await resolveTargets(mints.filter((mint) => !memory.has(mint) && !targets.has(mint)));
  await Promise.all(mints.map((mint) => ensureMint(mint)));
  const highs: Record<string, number> = {};
  for (const mint of mints) {
    const value = memory.get(mint);
    if (value && value > 0) highs[mint] = value;
  }
  return highs;
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
  if (memory.has(mint)) return Promise.resolve();
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
    if (!Array.isArray(rows)) return;
    let high = 0;
    for (const row of rows) {
      const price = Number(row?.[2]);
      if (Number.isFinite(price) && price > high) high = price;
    }
    if (high <= 0 || target.supply <= 0) return;
    const ath = Math.round(high * target.supply);
    if (ath <= 0) return;
    memory.set(mint, ath);
    scheduleDisk();
    return;
  }
}
