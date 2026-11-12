import { request as httpRequest, Agent as HttpAgent } from "node:http";
import { request as httpsRequest, Agent as HttpsAgent } from "node:https";
import { RPC_BUSY } from "@/lib/ingest/rpc-message";

const DEFAULT_RPC = "https://api.mainnet.solana.com";
/**
 * Public mainnet allows 40 calls to one method per 10 seconds.
 * A batch, or a gap near 250ms, trips "Too many requests for a specific RPC call".
 * One call at a time, with this gap, stays near 16 per 10 seconds.
 */
const HEAVY_GAP_MS = 600;
const LIGHT_GAP_MS = 350;
const HEAVY = new Set(["getTransaction", "getSignaturesForAddress"]);
const COOL_MS = 12_000;

const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 1 });
const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 1 });

export class RpcLimitError extends Error {
  constructor() {
    super(RPC_BUSY);
    this.name = "RpcLimitError";
  }
}

export function isRpcLimited(error: unknown): boolean {
  if (error instanceof RpcLimitError) return true;
  const message = error instanceof Error ? error.message : "";
  return /429|too many requests|rpc is busy/i.test(message);
}

type Priority = "book" | "scan";

interface Job {
  method: string;
  params: unknown[];
  priority: Priority;
  cacheMs: number;
  key: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const cache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const queue: Job[] = [];
const methodNotBefore = new Map<string, number>();
let draining = false;
let blockedUntil = 0;
let bookReaders = 0;

export function holdPublicRpc(ms: number): void {
  blockedUntil = Math.max(blockedUntil, Date.now() + ms);
}

/** Wallet reads go first. Background scans wait so they cannot share the burst. */
export function beginBookRead(): void {
  bookReaders += 1;
}

export function endBookRead(): void {
  bookReaders = Math.max(0, bookReaders - 1);
  kick();
}

function gapFor(method: string): number {
  return HEAVY.has(method) ? HEAVY_GAP_MS : LIGHT_GAP_MS;
}

function cacheTtl(method: string): number {
  if (method === "getTransaction") return 30 * 60_000;
  if (method === "getSignaturesForAddress") return 2 * 60_000;
  if (method === "getMultipleAccounts") return 60 * 60_000;
  if (method === "getBalance" || method === "getTokenAccountsByOwner") return 20_000;
  return 0;
}

export async function gatedRpc<T>(method: string, params: unknown[], options?: { priority?: Priority }): Promise<T> {
  const ttl = cacheTtl(method);
  const key = `${method}:${JSON.stringify(params)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = new Promise<unknown>((resolve, reject) => {
    queue.push({
      method,
      params,
      priority: options?.priority ?? "book",
      cacheMs: ttl,
      key,
      resolve,
      reject,
    });
    kick();
  });
  inflight.set(key, promise);
  void promise.then(
    () => {
      if (inflight.get(key) === promise) inflight.delete(key);
    },
    () => {
      if (inflight.get(key) === promise) inflight.delete(key);
    },
  );
  return promise as Promise<T>;
}

function kick(): void {
  if (draining) return;
  draining = true;
  void drain()
    .catch(() => undefined)
    .finally(() => {
      draining = false;
      if (queue.length > 0) kick();
    });
}

function takeNext(): Job | undefined {
  const bookAt = queue.findIndex((job) => job.priority === "book");
  if (bookAt >= 0) return queue.splice(bookAt, 1)[0];
  if (bookReaders > 0) return undefined;
  return queue.shift();
}

async function drain(): Promise<void> {
  for (;;) {
    const job = takeNext();
    if (!job) {
      if (bookReaders > 0 && queue.length > 0) {
        await sleep(50);
        continue;
      }
      return;
    }
    const wait = Math.max(0, blockedUntil - Date.now(), (methodNotBefore.get(job.method) ?? 0) - Date.now());
    if (wait > 0) await sleep(wait);
    if (job.priority === "scan" && queue.some((item) => item.priority === "book")) {
      queue.unshift(job);
      continue;
    }
    methodNotBefore.set(job.method, Date.now() + gapFor(job.method));
    const outcome = await postOnce(job.method, job.params);
    if (outcome.ok) {
      if (job.cacheMs > 0) cache.set(job.key, { expires: Date.now() + job.cacheMs, value: outcome.value });
      job.resolve(outcome.value);
      continue;
    }
    if (outcome.limited) {
      const until = Date.now() + COOL_MS;
      blockedUntil = Math.max(blockedUntil, until);
      methodNotBefore.set(job.method, blockedUntil);
      job.reject(new RpcLimitError());
      continue;
    }
    job.reject(new Error(outcome.message));
  }
}

type RpcOutcome =
  | { ok: true; value: unknown }
  | { ok: false; limited: true }
  | { ok: false; limited: false; message: string };

function postOnce(method: string, params: unknown[]): Promise<RpcOutcome> {
  const rpc = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const target = new URL(rpc);
  const transport = target.protocol === "http:" ? httpRequest : httpsRequest;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: RpcOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const req = transport(
      {
        method: "POST",
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        agent: target.protocol === "http:" ? httpAgent : httpsAgent,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          "user-agent": "extrapolate",
        },
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const status = res.statusCode ?? 500;
          const text = Buffer.concat(chunks).toString("utf8");
          if (status === 429 || status === 403) {
            finish({ ok: false, limited: true });
            return;
          }
          if (status >= 400) {
            finish({ ok: false, limited: false, message: "RPC failed" });
            return;
          }
          let body: { result?: unknown; error?: { code?: number; message?: string } };
          try {
            body = JSON.parse(text) as typeof body;
          } catch {
            finish({ ok: false, limited: false, message: "RPC returned invalid JSON" });
            return;
          }
          const message = body.error?.message ?? "";
          if (body.error && (body.error.code === 429 || /too many requests/i.test(message))) {
            finish({ ok: false, limited: true });
            return;
          }
          if (body.error) {
            finish({ ok: false, limited: false, message: "RPC error" });
            return;
          }
          finish({ ok: true, value: body.result });
        });
      },
    );
    req.on("error", () => finish({ ok: false, limited: false, message: "RPC failed" }));
    req.on("timeout", () => {
      req.destroy();
      finish({ ok: false, limited: false, message: "RPC timeout" });
    });
    req.end(payload);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
