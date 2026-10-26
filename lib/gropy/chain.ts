import { readFileSync, writeFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { isWalletAddress } from "@/lib/address";
import { TRACKED_KOLS } from "@/lib/kols";
import { gropyRpc } from "@/lib/gropy/rpc";
import { booksFromLegs, decodeTokenName, legFromTransaction, type SwapLeg } from "@/lib/gropy/swaps";
import type { BuySignal, ClosedTrade, OpenLot } from "@/lib/gropy/types";

/** gropy's own read of KOL wallets. Not the desk scan cache. */
export const GROPY_CHAIN_CACHE = "/tmp/gropy-chain.json";

const METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const FRESH_MS = 20 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

export interface KolRead {
  closed: ClosedTrade[];
  buys: BuySignal[];
  open: OpenLot[];
  readWallets: string[];
  skippedWallets: string[];
  unreadable: number;
}

interface CacheRow {
  at: number;
  closed: ClosedTrade[];
  buys: BuySignal[];
  open: OpenLot[];
  unreadable?: boolean;
}

interface CacheFile {
  cursor: number;
  wallets: Record<string, CacheRow>;
}

type Rpc = (method: string, params: unknown[]) => Promise<unknown>;

class BudgetError extends Error {}

export async function loadKolRecords(options?: {
  wallets?: { wallet: string }[];
  cachePath?: string;
  budgetMs?: number;
  rpc?: Rpc;
  now?: () => number;
  signatureLimit?: number;
  txLimit?: number;
}): Promise<KolRead> {
  const list = options?.wallets ?? TRACKED_KOLS;
  const cachePath = options?.cachePath ?? GROPY_CHAIN_CACHE;
  const rpc = options?.rpc ?? gropyRpc;
  const now = options?.now ?? Date.now;
  const signatureLimit = options?.signatureLimit ?? 20;
  const txLimit = options?.txLimit ?? 10;
  const cache = readCache(cachePath);
  const started = now();
  const deadline = started + (options?.budgetMs ?? 8_000);
  await nameCachedOpenLots(cache, rpc, deadline);
  let index = list.length === 0 ? 0 : cache.cursor % list.length;
  let steps = 0;
  while (list.length > 0 && steps < list.length && now() < deadline) {
    const wallet = list[index]?.wallet;
    index = (index + 1) % list.length;
    steps += 1;
    if (!wallet) continue;
    const row = cache.wallets[wallet];
    const age = row ? started - row.at : Number.POSITIVE_INFINITY;
    if (row && age < (row.unreadable ? RETRY_MS : FRESH_MS)) continue;
    try {
      const parsed = await readWallet(wallet, rpc, deadline, signatureLimit, txLimit);
      cache.wallets[wallet] = { at: now(), closed: parsed.closed, buys: parsed.buys, open: parsed.open };
    } catch (error) {
      if (error instanceof BudgetError) break;
      cache.wallets[wallet] = { at: now(), closed: [], buys: [], open: [], unreadable: true };
    }
  }
  cache.cursor = index;
  writeCache(cachePath, cache);
  return collect(cache, new Set(list.map((row) => row.wallet)));
}

async function readWallet(wallet: string, rpc: Rpc, deadline: number, signatureLimit: number, txLimit: number): Promise<{ closed: ClosedTrade[]; buys: BuySignal[]; open: OpenLot[] }> {
  if (Date.now() > deadline) throw new BudgetError();
  const signatures = await rpc("getSignaturesForAddress", [wallet, { limit: signatureLimit }]);
  if (!Array.isArray(signatures)) throw new Error("signatures");
  const ok = signatures.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const signature = (row as { signature?: unknown }).signature;
    const err = (row as { err?: unknown }).err;
    if (typeof signature !== "string" || err) return [];
    return [signature];
  });
  const legs: SwapLeg[] = [];
  for (const signature of ok.slice(0, txLimit)) {
    if (Date.now() > deadline) throw new BudgetError();
    const tx = await rpc("getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }]);
    const leg = legFromTransaction(wallet, tx, signature);
    if (leg) legs.push(leg);
  }
  const books = booksFromLegs(legs);
  await attachNames(books.buys, books.open, rpc, deadline);
  return books;
}

const NAME_LIMIT = 6;
const OPEN_NAME_LIMIT = 12;

/**
 * Unnamed mints worth a metadata read. A coin still held is named before older buys,
 * and a name already on the buy does not take a slot.
 */
export function mintsForNames(
  buys: readonly { mint: string; symbol?: string }[],
  open: readonly { mint: string }[],
  limit = NAME_LIMIT,
): string[] {
  const openMints = new Set(open.map((lot) => lot.mint));
  const unnamed = [...new Set(buys.filter((buy) => !buy.symbol?.trim()).map((buy) => buy.mint))];
  const held = unnamed.filter((mint) => openMints.has(mint)).slice(0, OPEN_NAME_LIMIT);
  const rest = unnamed.filter((mint) => !openMints.has(mint));
  return [...held, ...rest.slice(0, Math.max(limit - held.length, 0))];
}

async function nameCachedOpenLots(cache: CacheFile, rpc: Rpc, deadline: number): Promise<void> {
  const buysByMint = new Map<string, BuySignal[]>();
  for (const row of Object.values(cache.wallets)) {
    if (row.unreadable) continue;
    const held = new Set(row.open.map((lot) => lot.mint));
    for (const buy of row.buys) {
      if (!held.has(buy.mint) || buy.symbol?.trim()) continue;
      const list = buysByMint.get(buy.mint) ?? [];
      list.push(buy);
      buysByMint.set(buy.mint, list);
    }
  }
  for (const mint of [...buysByMint.keys()].slice(0, 24)) {
    if (Date.now() > deadline) return;
    const labeled = await labelMint(mint, rpc);
    if (!labeled) continue;
    for (const buy of buysByMint.get(mint) ?? []) {
      buy.symbol = labeled.symbol;
      if (labeled.name) buy.coinName = labeled.name;
    }
  }
}

async function attachNames(buys: BuySignal[], open: readonly OpenLot[], rpc: Rpc, deadline: number): Promise<void> {
  for (const mint of mintsForNames(buys, open)) {
    if (Date.now() > deadline) return;
    const labeled = await labelMint(mint, rpc);
    if (!labeled) continue;
    for (const buy of buys) {
      if (buy.mint !== mint) continue;
      buy.symbol = labeled.symbol;
      if (labeled.name) buy.coinName = labeled.name;
    }
  }
}

async function labelMint(mint: string, rpc: Rpc): Promise<{ symbol: string; name: string } | null> {
  const classic = await metaplexLabel(mint, rpc);
  if (classic) return classic;
  return token2022Label(mint, rpc);
}

async function metaplexLabel(mint: string, rpc: Rpc): Promise<{ symbol: string; name: string } | null> {
  try {
    const result = await rpc("getAccountInfo", [metadataAddress(mint), { encoding: "base64" }]);
    const decoded = decodeAccount(result);
    if (!decoded) return null;
    return labelPair(decoded.symbol, decoded.name);
  } catch {
    // A missing name skips the copy later. The close still counts.
    return null;
  }
}

async function token2022Label(mint: string, rpc: Rpc): Promise<{ symbol: string; name: string } | null> {
  try {
    const result = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
    const embedded = tokenMetadata(result);
    if (!embedded) return null;
    return labelPair(embedded.symbol, embedded.name);
  } catch {
    return null;
  }
}

function labelPair(symbolRaw: string, nameRaw: string): { symbol: string; name: string } | null {
  const symbol = cleanLabel(symbolRaw);
  const name = cleanLabel(nameRaw);
  const label = symbol || name;
  if (!label) return null;
  return { symbol: label, name };
}

function tokenMetadata(result: unknown): { name: string; symbol: string } | null {
  const value = result && typeof result === "object" && "value" in result ? (result as { value?: unknown }).value : result;
  if (!value || typeof value !== "object" || !("data" in value)) return null;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object" || !("parsed" in data)) return null;
  const parsed = (data as { parsed?: unknown }).parsed;
  if (!parsed || typeof parsed !== "object" || !("info" in parsed)) return null;
  const info = (parsed as { info?: unknown }).info;
  if (!info || typeof info !== "object" || !("extensions" in info)) return null;
  const extensions = (info as { extensions?: unknown }).extensions;
  if (!Array.isArray(extensions)) return null;
  for (const row of extensions) {
    if (!row || typeof row !== "object" || (row as { extension?: unknown }).extension !== "tokenMetadata") continue;
    const state = (row as { state?: unknown }).state;
    if (!state || typeof state !== "object") continue;
    const name = (state as { name?: unknown }).name;
    const symbol = (state as { symbol?: unknown }).symbol;
    if (typeof name !== "string" || typeof symbol !== "string") continue;
    return { name, symbol };
  }
  return null;
}

function metadataAddress(mint: string): string {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA.toBuffer(), new PublicKey(mint).toBuffer()],
    METADATA,
  );
  return pda.toBase58();
}

function decodeAccount(result: unknown): { name: string; symbol: string } | null {
  const value = result && typeof result === "object" && "value" in result ? (result as { value?: unknown }).value : result;
  if (!value || typeof value !== "object" || !("data" in value)) return null;
  const data = (value as { data?: unknown }).data;
  const base64 = Array.isArray(data) ? data[0] : data;
  if (typeof base64 !== "string" || !base64) return null;
  return decodeTokenName(Buffer.from(base64, "base64"));
}

function cleanLabel(value: string): string {
  const text = value.trim();
  if (!text || text.includes("·") || text.includes("…") || isWalletAddress(text)) return "";
  return text;
}

function collect(cache: CacheFile, allowed: Set<string>): KolRead {
  const closed: ClosedTrade[] = [];
  const buys: BuySignal[] = [];
  const open: OpenLot[] = [];
  const readWallets: string[] = [];
  const skippedWallets: string[] = [];
  let unreadable = 0;
  for (const [wallet, row] of Object.entries(cache.wallets)) {
    if (!allowed.has(wallet)) continue;
    if (row.unreadable) {
      unreadable += 1;
      continue;
    }
    readWallets.push(wallet);
    const ownClosed = row.closed.filter((trade) => trade.wallet === wallet);
    const ownBuys = row.buys.filter((buy) => buy.wallet === wallet);
    const ownOpen = row.open.filter((lot) => lot.wallet === wallet);
    if (ownClosed.length === 0) skippedWallets.push(wallet);
    closed.push(...ownClosed);
    buys.push(...ownBuys);
    open.push(...ownOpen);
  }
  return { closed, buys, open, readWallets, skippedWallets, unreadable };
}

function readCache(file: string): CacheFile {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { cursor?: unknown; wallets?: unknown };
    const wallets: Record<string, CacheRow> = {};
    if (parsed.wallets && typeof parsed.wallets === "object") {
      for (const [wallet, row] of Object.entries(parsed.wallets as Record<string, unknown>)) {
        const clean = sanitizeRow(row);
        if (clean) wallets[wallet] = clean;
      }
    }
    const cursor = typeof parsed.cursor === "number" && parsed.cursor >= 0 ? parsed.cursor : 0;
    return { cursor, wallets };
  } catch {
    return { cursor: 0, wallets: {} };
  }
}

function sanitizeRow(value: unknown): CacheRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { at?: unknown; closed?: unknown; buys?: unknown; open?: unknown; unreadable?: unknown };
  if (typeof row.at !== "number") return null;
  const legacy = !Array.isArray(row.open);
  return {
    at: legacy && row.unreadable !== true ? 0 : row.at,
    closed: Array.isArray(row.closed) ? row.closed.flatMap(sanitizeClosed) : [],
    buys: Array.isArray(row.buys) ? row.buys.flatMap(sanitizeBuy) : [],
    open: Array.isArray(row.open) ? row.open.flatMap(sanitizeOpen) : [],
    unreadable: row.unreadable === true,
  };
}

function sanitizeOpen(value: unknown): OpenLot[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.wallet !== "string" || typeof row.mint !== "string") return [];
  if (typeof row.tokens !== "number" || !Number.isFinite(row.tokens) || !(row.tokens > 0)) return [];
  return [{ id: row.id, wallet: row.wallet, mint: row.mint, tokens: row.tokens }];
}

function sanitizeClosed(value: unknown): ClosedTrade[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  if (typeof row.wallet !== "string" || typeof row.closedAt !== "string" || !Number.isFinite(Date.parse(row.closedAt))) return [];
  const pnlSol = typeof row.pnlSol === "number" && Number.isFinite(row.pnlSol) ? row.pnlSol : undefined;
  const pnlUsd = typeof row.pnlUsd === "number" && Number.isFinite(row.pnlUsd) ? row.pnlUsd : undefined;
  if (pnlSol == null && pnlUsd == null) return [];
  const trade: ClosedTrade = { id: stringOr(row.id, `${row.wallet}|${row.closedAt}`), wallet: row.wallet, closedAt: row.closedAt };
  if (pnlSol != null) trade.pnlSol = pnlSol;
  if (pnlUsd != null) trade.pnlUsd = pnlUsd;
  if (typeof row.mint === "string") trade.mint = row.mint;
  if (typeof row.symbol === "string" && row.symbol.trim()) trade.symbol = row.symbol.trim();
  if (typeof row.amountSol === "number" && Number.isFinite(row.amountSol)) trade.amountSol = row.amountSol;
  return [trade];
}

function sanitizeBuy(value: unknown): BuySignal[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  if (typeof row.wallet !== "string" || typeof row.mint !== "string" || typeof row.boughtAt !== "string") return [];
  if (!Number.isFinite(Date.parse(row.boughtAt))) return [];
  const buy: BuySignal = { id: stringOr(row.id, `${row.wallet}|${row.mint}|${row.boughtAt}`), wallet: row.wallet, mint: row.mint, boughtAt: row.boughtAt };
  if (typeof row.symbol === "string" && row.symbol.trim()) buy.symbol = row.symbol.trim();
  if (typeof row.coinName === "string" && row.coinName.trim()) buy.coinName = row.coinName.trim();
  if (typeof row.amountSol === "number" && Number.isFinite(row.amountSol) && row.amountSol > 0) buy.amountSol = row.amountSol;
  return [buy];
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function writeCache(file: string, cache: CacheFile): void {
  try {
    writeFileSync(file, JSON.stringify(cache));
  } catch {
    // The next read fetches again.
  }
}
