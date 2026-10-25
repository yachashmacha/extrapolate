import { readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest, Agent as HttpAgent } from "node:http";
import { request as httpsRequest, Agent as HttpsAgent } from "node:https";
import { TRACKED_KOLS } from "@/lib/kols";
import { associatedTokenAddress } from "@/lib/ingest/ata";

const CACHE_PATH = "/tmp/extrapolate-kols.json";
const RPC = process.env.SOLANA_RPC_URL || "https://solana-rpc.publicnode.com";
const BATCH = 25;
const CONCURRENCY = 2;
const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 8 });
const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 8 });

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
let pauseUntil = 0;

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
    runBatch(jobs).finally(() => {
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
  const [row] = await rpcBatch([{ method, params }]);
  if (!row || row.error) throw new Error(row?.error?.message || `RPC ${method} failed`);
  return row.result as T;
}

async function rpcBatch(calls: { method: string; params: unknown[] }[]): Promise<(RpcRow | null)[]> {
  let last = "RPC failed";
  const delay = pauseUntil - Date.now();
  if (delay > 0) await wait(delay);
  const payload = JSON.stringify(calls.map((call, id) => ({ jsonrpc: "2.0", id, method: call.method, params: call.params })));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const parsed = await postRpc(payload);
      if (!Array.isArray(parsed)) {
        if (parsed.error) throw new Error(parsed.error.message || "RPC error");
        throw new Error("RPC batch failed");
      }
      const byId = new Map(parsed.map((row) => [row.id, row]));
      return calls.map((_, id) => byId.get(id) ?? null);
    } catch (error) {
      last = error instanceof Error ? error.message : "RPC failed";
      const paused = /429/.test(last);
      if (attempt === 3) break;
      await wait(paused ? 500 * (attempt + 1) : 200 * (attempt + 1));
    }
  }
  throw new Error(last);
}

function postRpc(body: string): Promise<RpcRow | RpcRow[]> {
  const target = new URL(RPC);
  const transport = target.protocol === "http:" ? httpRequest : httpsRequest;
  return new Promise((resolve, reject) => {
    const req = transport(
      {
        method: "POST",
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        agent: target.protocol === "http:" ? httpAgent : httpsAgent,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "user-agent": "extrapolate",
        },
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 500;
          if (status === 429 || status === 403) {
            pauseUntil = Math.max(pauseUntil, Date.now() + 1200);
            reject(new Error(`RPC status ${status}`));
            return;
          }
          if (status >= 400) {
            reject(new Error(`RPC status ${status}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as RpcRow | RpcRow[]);
          } catch {
            reject(new Error("RPC returned invalid JSON"));
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("RPC timeout")));
    req.end(body);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
