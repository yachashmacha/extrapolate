import { readFileSync, writeFileSync } from "node:fs";
import { TRACKED_KOLS } from "@/lib/kols";
import { associatedTokenAddress } from "@/lib/ingest/ata";
import { gatedRpc, isRpcLimited } from "@/lib/ingest/rpc-gate";

const CACHE_PATH = "/tmp/extrapolate-kols.json";
const BATCH = 1;
const CONCURRENCY = 1;

export interface KolHit {
  mint: string;
  wallet: string;
  name: string;
  boughtAt: string;
}

interface Job {
  wallet: string;
  mint: string;
  program: string;
  tries: number;
  page: number;
  before?: string;
  earliest: number;
}

interface RpcRow {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

interface SignatureRow {
  signature: string;
  blockTime?: number | null;
}

const memory = new Map<string, number>();
const programs = new Map<string, string>();
const queued = new Set<string>();
const queue: Job[] = [];
const names = new Map(TRACKED_KOLS.map((kol) => [kol.wallet, kol.name]));
let active = 0;
let diskTimer: ReturnType<typeof setTimeout> | null = null;
let loaded = false;
let preparing = false;

function loadDisk(): void {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, number>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && value >= 0) memory.set(key, value);
    }
  } catch {
    // The first check of a coin fills this file.
  }
}

function scheduleDisk(): void {
  if (diskTimer) return;
  diskTimer = setTimeout(() => {
    diskTimer = null;
    flushDisk();
  }, 2000);
}

function flushDisk(): void {
  if (diskTimer) {
    clearTimeout(diskTimer);
    diskTimer = null;
  }
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // A missed write only repeats the read next time.
  }
}

function keyOf(wallet: string, mint: string): string {
  return `${wallet}|${mint}`;
}

function covered(wallet: string, mint: string): boolean {
  const key = keyOf(wallet, mint);
  return memory.has(key) || queued.has(key);
}

export function startKolScan(requests: { mint: string; entryAt: string }[]): void {
  loadDisk();
  const mints = [...new Map(requests.map((row) => [row.mint, row.entryAt])).entries()]
    .sort((left, right) => right[1].localeCompare(left[1]))
    .map(([mint]) => mint);
  if (preparing) return;
  const missing = mints.some((mint) => TRACKED_KOLS.some((kol) => !covered(kol.wallet, mint)));
  if (!missing) {
    kick();
    return;
  }
  preparing = true;
  void resolvePrograms(mints)
    .then(() => {
      for (const mint of mints) {
        const program = programs.get(mint);
        if (!program) continue;
        for (const kol of TRACKED_KOLS) {
          if (covered(kol.wallet, mint)) continue;
          enqueue({ wallet: kol.wallet, mint, program, tries: 0, page: 0, earliest: 0 });
        }
      }
    })
    .catch(() => undefined)
    .finally(() => {
      preparing = false;
      kick();
    });
}

export function kolScanSnapshot(mints: string[]): { checked: number; total: number; pending: boolean; matches: KolHit[] } {
  loadDisk();
  const unique = [...new Set(mints)];
  const total = unique.length * TRACKED_KOLS.length;
  let checked = 0;
  const matches: KolHit[] = [];
  for (const mint of unique) {
    for (const kol of TRACKED_KOLS) {
      const value = memory.get(keyOf(kol.wallet, mint));
      if (value === undefined) continue;
      checked += 1;
      if (value > 0) {
        matches.push({
          mint,
          wallet: kol.wallet,
          name: names.get(kol.wallet) ?? kol.name,
          boughtAt: new Date(value * 1000).toISOString(),
        });
      }
    }
  }
  const pending = preparing || active > 0 || queue.length > 0 || checked < total;
  return { checked, total, pending, matches };
}

function enqueue(job: Job): void {
  const key = keyOf(job.wallet, job.mint);
  if (job.page === 0 && (memory.has(key) || queued.has(key))) return;
  queued.add(key);
  queue.push(job);
}

function kick(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const jobs: Job[] = [];
    while (jobs.length < BATCH && queue.length > 0) {
      const job = queue.shift();
      if (job) jobs.push(job);
    }
    if (jobs.length === 0) return;
    active += 1;
    void runBatch(jobs)
      .catch(() => undefined)
      .finally(() => {
        active -= 1;
        kick();
      });
  }
  if (active === 0 && queue.length === 0 && !preparing) flushDisk();
}

async function runBatch(jobs: Job[]): Promise<void> {
  const pending: Job[] = [];
  const calls: { method: string; params: unknown[] }[] = [];
  for (const job of jobs) {
    try {
      const ata = associatedTokenAddress(job.wallet, job.mint, job.program);
      const options: { limit: number; before?: string } = { limit: 20 };
      if (job.before) options.before = job.before;
      calls.push({ method: "getSignaturesForAddress", params: [ata, options] });
      pending.push(job);
    } catch {
      finish(job);
    }
  }
  if (pending.length === 0) return;
  let rows: (RpcRow | null)[];
  try {
    rows = await rpcBatch(calls);
  } catch {
    for (const job of pending) requeue(job);
    return;
  }
  for (let index = 0; index < pending.length; index += 1) {
    const job = pending[index];
    const row = rows[index];
    if (!row || row.error || !Array.isArray(row.result)) {
      requeue(job);
      continue;
    }
    const sigs = row.result as SignatureRow[];
    for (const sig of sigs) {
      if (sig.blockTime && (job.earliest === 0 || sig.blockTime < job.earliest)) job.earliest = sig.blockTime;
    }
    const cursor = sigs.length === 20 ? sigs[sigs.length - 1]?.signature : undefined;
    if (cursor && job.page < 3) {
      job.before = cursor;
      job.page += 1;
      job.tries = 0;
      queue.push(job);
      continue;
    }
    finish(job);
  }
}

function finish(job: Job): void {
  memory.set(keyOf(job.wallet, job.mint), job.earliest);
  queued.delete(keyOf(job.wallet, job.mint));
  scheduleDisk();
}

function requeue(job: Job): void {
  if (job.tries < 3) {
    job.tries += 1;
    queue.push(job);
    return;
  }
  queued.delete(keyOf(job.wallet, job.mint));
}

async function resolvePrograms(mints: string[]): Promise<void> {
  const missing = mints.filter((mint) => !programs.has(mint));
  for (let offset = 0; offset < missing.length; offset += 100) {
    const chunk = missing.slice(offset, offset + 100);
    try {
      const value = await rpc<{ value?: Array<{ owner?: string } | null> }>("getMultipleAccounts", [
        chunk,
        { encoding: "jsonParsed" },
      ]);
      chunk.forEach((mint, index) => {
        const owner = value?.value?.[index]?.owner;
        if (owner) programs.set(mint, owner);
      });
    } catch {
      // Leave the mint unresolved so the next poll can try again. A classic-token guess would cache a miss.
    }
  }
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  return gatedRpc<T>(method, params, { priority: "scan" });
}

async function rpcBatch(calls: { method: string; params: unknown[] }[]): Promise<(RpcRow | null)[]> {
  const rows: (RpcRow | null)[] = [];
  for (const call of calls) {
    try {
      const result = await rpc(call.method, call.params);
      rows.push({ result });
    } catch (error) {
      if (isRpcLimited(error)) throw error;
      rows.push(null);
    }
  }
  return rows;
}
