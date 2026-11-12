import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isWalletAddress } from "@/lib/address";
import { isTerminalId } from "@/lib/terminals";
import type { Book, TerminalId } from "@/lib/types";
import type { MintMeta } from "@/lib/ingest/round-trips";
import { noteMints, startHighs } from "@/lib/ingest/highs";
import { buildRoundTrips } from "@/lib/ingest/round-trips";
import { beginBookRead, endBookRead, gatedRpc, holdPublicRpc, isRpcLimited, RpcLimitError } from "@/lib/ingest/rpc-gate";
import { RPC_BUSY } from "@/lib/ingest/rpc-message";
import {
  parseHeliusTransaction,
  parseRpcTransaction,
  type Fill,
  type HeliusTransaction,
  type ParsedTransaction,
} from "@/lib/ingest/parse";

const BOOK_CACHE_MS = 45_000;
/**
 * Enough paced getTransaction calls to reach the recent closes, plus a cooldown
 * when the public node answers 429. A longer walk stays in the background once a
 * book with closes is already on disk.
 */
const TX_BUDGET_MS = 60_000;
const BOOK_DIR = path.join(tmpdir(), "extrapolate-wallet-books");
const freshCache = new Map<string, { expires: number; book: Book }>();
const lastGood = new Map<string, Book>();
const inflight = new Map<string, Promise<Book>>();

export async function fetchWalletBook(
  address: string,
  terminalInput: string | null,
  depth = 200,
): Promise<Book> {
  const wallet = address.trim();
  if (!isWalletAddress(wallet)) {
    throw new Error("That does not look like a Solana address.");
  }
  const terminal: TerminalId = isTerminalId(terminalInput) ? terminalInput : "wallet";
  const key = `${wallet}|${terminal}|${clampDepth(depth)}`;
  const fresh = freshCache.get(key);
  if (fresh && fresh.expires > Date.now()) return fresh.book;

  rememberDisk(key);
  const prior = lastGood.get(key);
  const pending = inflight.get(key) ?? startRefresh(key, wallet, terminal, depth);
  // Opens alone are not the book. Wait for the read that can still find the closes.
  if (prior && prior.trades.length > 0) return prior;
  return pending;
}

function startRefresh(key: string, wallet: string, terminal: TerminalId, depth: number): Promise<Book> {
  const pending = readWalletBook(wallet, terminal, depth)
    .then((book) => keepBook(key, book))
    .catch((error: unknown) => {
      const prior = lastGood.get(key);
      if (prior && (rateLimited(error) || worthKeeping(prior))) return prior;
      throw error;
    })
    .finally(() => {
      if (inflight.get(key) === pending) inflight.delete(key);
    });
  inflight.set(key, pending);
  return pending;
}

function keepBook(key: string, book: Book): Book {
  const prior = lastGood.get(key);
  const next = prior && prior.trades.length > book.trades.length ? prior : book;
  if (!worthKeeping(next)) return book;
  lastGood.set(key, next);
  freshCache.set(key, { expires: Date.now() + BOOK_CACHE_MS, book: next });
  writeDisk(key, next);
  return next;
}

function worthKeeping(book: Book): boolean {
  return book.trades.length > 0 || book.opens.length > 0;
}

function rememberDisk(key: string): void {
  if (lastGood.has(key)) return;
  const stored = readDisk(key);
  if (stored) lastGood.set(key, stored);
}

function bookFile(key: string): string {
  const name = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return path.join(BOOK_DIR, `${name}.json`);
}

function readDisk(key: string): Book | null {
  try {
    const parsed = JSON.parse(readFileSync(bookFile(key), "utf8")) as Book;
    if (!parsed || parsed.source !== "wallet" || !Array.isArray(parsed.trades) || !Array.isArray(parsed.opens)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDisk(key: string, book: Book): void {
  try {
    mkdirSync(BOOK_DIR, { recursive: true });
    writeFileSync(bookFile(key), JSON.stringify(book));
  } catch {
    // The memory copy still serves this process.
  }
}

async function readWalletBook(
  wallet: string,
  terminal: TerminalId,
  depth: number,
): Promise<Book> {
  beginBookRead();
  try {
    return await readWalletBookNow(wallet, terminal, depth);
  } finally {
    endBookRead();
  }
}

async function readWalletBookNow(
  wallet: string,
  terminal: TerminalId,
  depth: number,
): Promise<Book> {
  const warnings: string[] = [];

  const solPrice = await loadSolPrices();
  if (!solPrice.priced) {
    warnings.push("SOL/USD history did not load. Swaps quoted in SOL were left out instead of priced with a guess.");
  }

  let fills: Fill[] = [];
  let scanned = 0;
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) {
    try {
      const helius = await loadHelius(wallet, heliusKey, solPrice.priceAt);
      fills = helius.fills;
      scanned = helius.scanned;
    } catch {
      warnings.push("Helius did not answer. Fell back to a public RPC.");
    }
  }
  if (fills.length === 0) {
    const rpc = await loadRpc(wallet, solPrice.priceAt, clampDepth(depth));
    fills = rpc.fills;
    scanned = rpc.scanned;
    if (rpc.warning) warnings.push(rpc.warning);
  }

  const metas = await loadMintMeta([...new Set(fills.map((fill) => fill.mint))]);
  noteMints(metas);
  const built = buildRoundTrips(fills, metas, terminal);
  startHighs([...new Set(built.trades.map((trade) => trade.mint))]);
  if (built.trades.length === 0 && fills.length === 0 && !warnings.includes(RPC_BUSY)) {
    warnings.push("No SOL or USDC memecoin swaps showed up in the recent transactions. A CSV export from the terminal still works.");
  }

  const spot = solPrice.priceAt(new Date().toISOString()) || (await loadSpotSol());
  if (!(spot && spot > 0)) {
    warnings.push("The current SOL price did not load, so the wallet total was left blank.");
  }
  const balances = spot && spot > 0 ? await loadAccountUsd(wallet, spot, built.opens) : undefined;

  return {
    source: "wallet",
    address: wallet,
    terminal,
    label: wallet,
    trades: built.trades,
    opens: built.opens,
    warnings,
    fetchedAt: new Date().toISOString(),
    scannedTransactions: scanned,
    accountUsd: balances?.portfolioUsd,
    cashUsd: balances?.cashUsd,
  };
}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const STABLES = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);
const WSOL_MINT = "So11111111111111111111111111111111111111112";

async function loadAccountUsd(
  wallet: string,
  solPrice: number,
  opens: { costUsd: number }[],
): Promise<{ portfolioUsd?: number; cashUsd?: number } | undefined> {
  try {
    const balance = await rpcCall<number | { value?: number }>("getBalance", [wallet]);
    const lamports = typeof balance === "number" ? balance : Number(balance?.value ?? 0);
    const sol = (Number.isFinite(lamports) ? lamports : 0) / 1_000_000_000;
    let stables = 0;
    let wrapped = 0;
    try {
      const accounts = await rpcCall<{ value?: TokenAccount[] }>("getTokenAccountsByOwner", [
        wallet,
        { programId: TOKEN_PROGRAM },
        { encoding: "jsonParsed" },
      ]);
      for (const row of accounts?.value ?? []) {
        const info = row.account?.data?.parsed?.info;
        const mint = info?.mint;
        const amount = Number(info?.tokenAmount?.uiAmount ?? info?.tokenAmount?.uiAmountString ?? 0);
        if (!mint || !Number.isFinite(amount) || amount <= 0) continue;
        if (STABLES.has(mint)) stables += amount;
        if (mint === WSOL_MINT) wrapped += amount;
      }
    } catch {
      // SOL balance still counts.
    }
    const liquid = sol * solPrice + wrapped * solPrice + stables;
    const openCost = opens.reduce((sum, open) => sum + (open.costUsd > 0 ? open.costUsd : 0), 0);
    const total = liquid + openCost;
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      portfolioUsd: total > 0 ? round(total) : undefined,
      cashUsd: Number.isFinite(liquid) ? round(Math.max(0, liquid)) : undefined,
    };
  } catch {
    return undefined;
  }
}

interface TokenAccount {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: { uiAmount?: number | null; uiAmountString?: string | null };
        };
      };
    };
  };
}

async function loadHelius(
  wallet: string,
  apiKey: string,
  priceAt: (iso: string) => number,
): Promise<{ fills: Fill[]; scanned: number }> {
  const url = `https://api.helius.xyz/v0/addresses/${encodeURIComponent(wallet)}/transactions?api-key=${encodeURIComponent(apiKey)}&limit=80`;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`status ${response.status}`);
  const body = (await response.json()) as HeliusTransaction[];
  if (!Array.isArray(body)) throw new Error("unexpected payload");
  const fills = body
    .map((tx) => parseHeliusTransaction(tx, wallet, priceAt(tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : "")))
    .filter((fill): fill is Fill => fill !== null);
  return { fills, scanned: body.length };
}

async function loadRpc(
  wallet: string,
  priceAt: (iso: string) => number,
  depth: number,
): Promise<{ fills: Fill[]; scanned: number; warning?: string }> {
  const sigs = await loadSignatures(wallet, depth);
  const { transactions, stoppedEarly } = await loadParsedTransactions(sigs);
  const fills: Fill[] = [];
  transactions.forEach((tx, index) => {
    if (!tx) return;
    const signature = sigs[index];
    const at = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : "";
    const fill = parseRpcTransaction(tx, wallet, priceAt(at), signature);
    if (fill) fills.push(fill);
  });
  let warning: string | undefined;
  if (sigs.length === 0) {
    warning = "The RPC returned no recent signatures for this address.";
  } else if (stoppedEarly && fills.length === 0) {
    warning = RPC_BUSY;
  }
  return { fills, scanned: sigs.length, warning };
}

/**
 * Retries a 429 quietly. Stops after several signatures fail in a row, including timeouts,
 * and stops when the budget runs out so a slow node cannot hold the desk on a blank page.
 */
async function loadParsedTransactions(
  signatures: string[],
  budgetMs = TX_BUDGET_MS,
): Promise<{ transactions: (ParsedTransaction | null)[]; stoppedEarly: boolean }> {
  const transactions: (ParsedTransaction | null)[] = new Array(signatures.length).fill(null);
  const deadline = Date.now() + budgetMs;
  let stoppedEarly = false;
  let run = 0;
  for (let index = 0; index < signatures.length; index += 1) {
    if (Date.now() >= deadline) {
      stoppedEarly = true;
      break;
    }
    let loaded = false;
    let failed = false;
    let limited = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (Date.now() >= deadline) break;
      try {
        transactions[index] = await gatedRpc<ParsedTransaction | null>("getTransaction", [
          signatures[index],
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 },
        ], { priority: "book" });
        loaded = true;
        break;
      } catch (error) {
        failed = true;
        limited = isRpcLimited(error);
        if (!limited || attempt === 3) break;
        const pause = Math.min(12_000, deadline - Date.now());
        if (pause < 500) break;
        holdPublicRpc(pause);
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
    }
    if (loaded) {
      run = 0;
      continue;
    }
    if (Date.now() >= deadline) {
      stoppedEarly = true;
      break;
    }
    if (!failed || limited) continue;
    run += 1;
    if (run >= 4) {
      stoppedEarly = true;
      break;
    }
  }
  return { transactions, stoppedEarly };
}

async function loadMintMeta(mints: string[]): Promise<Map<string, MintMeta>> {
  const map = new Map<string, MintMeta>();
  for (let offset = 0; offset < mints.length; offset += 30) {
    const chunk = mints.slice(offset, offset + 30);
    if (chunk.length === 0) continue;
    try {
      const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
        headers: { accept: "application/json" },
      });
      if (!response.ok) continue;
      const body = await response.json();
      const pairs = Array.isArray(body) ? body : body?.pairs ?? [];
      for (const pair of pairs) absorbPair(map, pair);
    } catch {
      // Names and market caps stay blank. Size and time still analyze.
    }
  }
  return map;
}

function absorbPair(map: Map<string, MintMeta>, pair: DexPair) {
  const mint = pair?.baseToken?.address;
  if (!mint) return;
  const liquidity = Number(pair.liquidity?.usd ?? 0);
  const current = map.get(mint);
  if (current && current.liquidityUsd >= liquidity) return;
  const price = Number(pair.priceUsd ?? 0);
  const fdv = Number(pair.fdv ?? 0);
  const marketCap = Number(pair.marketCap ?? 0);
  const supply = price > 0 ? (fdv > 0 ? fdv : marketCap) / price : 0;
  map.set(mint, {
    symbol: pair.baseToken?.symbol || mint.slice(0, 4),
    name: pair.baseToken?.name || pair.baseToken?.symbol || mint.slice(0, 4),
    supply: Number.isFinite(supply) ? supply : 0,
    liquidityUsd: Number.isFinite(liquidity) ? liquidity : 0,
    pairAddress: pair.pairAddress,
  });
}

interface DexPair {
  baseToken?: { address?: string; name?: string; symbol?: string };
  pairAddress?: string;
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
}

async function loadSolPrices(): Promise<{ priceAt: (iso: string) => number; priced: boolean }> {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=90",
      { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } },
    );
    if (response.ok) {
      const body = (await response.json()) as { prices?: [number, number][] };
      const prices = (body.prices ?? []).filter((row) => row.length === 2 && row[1] > 0);
      if (prices.length > 0) {
        return {
          priced: true,
          priceAt(iso: string) {
            const time = Date.parse(iso);
            if (!Number.isFinite(time)) return 0;
            let nearest = prices[0];
            let best = Infinity;
            for (const row of prices) {
              const gap = Math.abs(row[0] - time);
              if (gap < best) {
                best = gap;
                nearest = row;
              }
            }
            return nearest[1] > 0 ? nearest[1] : 0;
          },
        };
      }
    }
  } catch {
    // Leave SOL-quoted fills unpriced. A guessed SOL price would invent the dollar size.
  }
  return { priced: false, priceAt: () => 0 };
}

async function loadSpotSol(): Promise<number | null> {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "application/json" },
    });
    if (response.ok) {
      const body = (await response.json()) as { solana?: { usd?: number } };
      const price = body.solana?.usd;
      if (price && price > 0) return price;
    }
  } catch {
    // The wallet total stays blank when the spot price is missing.
  }
  return null;
}

async function loadSignatures(wallet: string, depth: number): Promise<string[]> {
  const signatures: string[] = [];
  let before: string | undefined;
  while (signatures.length < depth) {
    const limit = Math.min(1000, depth - signatures.length);
    const page = await rpcCall<{ signature: string }[]>("getSignaturesForAddress", [
      wallet,
      before ? { limit, before } : { limit },
    ]);
    if (!page?.length) break;
    for (const row of page) {
      if (row.signature) signatures.push(row.signature);
    }
    before = page[page.length - 1]?.signature;
    if (page.length < limit) break;
  }
  return signatures;
}

function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) return 200;
  return Math.max(20, Math.min(250, Math.round(depth)));
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  let last: unknown = new Error("The wallet could not be read.");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await gatedRpc<T>(method, params, { priority: "book" });
    } catch (error) {
      last = error;
      if (!rateLimited(error) || attempt === 3) break;
      // The public window is 10 seconds. A 429 waits it out. Other blips wait 3 seconds.
      const pause = isRpcLimited(error) ? 12_000 : 3_000;
      if (isRpcLimited(error)) holdPublicRpc(pause);
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }
  if (isRpcLimited(last)) throw new RpcLimitError();
  throw last instanceof Error ? last : new Error("The wallet could not be read.");
}

function rateLimited(error: unknown): boolean {
  return isRpcLimited(error) || /502|503|timeout|timed out|congested/i.test(messageOf(error));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "request failed";
}
