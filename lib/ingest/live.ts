import { isWalletAddress } from "@/lib/address";
import { isTerminalId, terminalName } from "@/lib/terminals";
import type { Book, TerminalId } from "@/lib/types";
import type { MintMeta } from "@/lib/ingest/round-trips";
import { buildRoundTrips } from "@/lib/ingest/round-trips";
import {
  parseHeliusTransaction,
  parseRpcTransaction,
  type Fill,
  type HeliusTransaction,
  type ParsedTransaction,
} from "@/lib/ingest/parse";

const DEFAULT_RPC = "https://solana-rpc.publicnode.com";

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
  const warnings = [
    `Fills are reconstructed from the wallet ${terminal === "wallet" ? "itself" : `${terminalName(terminal)} settles to`}. Entry market cap is fill price times current supply.`,
    "KOLs are not on the transaction. Tag who was in each coin and the desk will fold them into the reading.",
    "Liquidity is the pool right now, not the pool at the fill.",
  ];

  const solPrice = await loadSolPrices();
  if (solPrice.approximate) {
    warnings.push("SOL was priced at the current rate for every fill. Dollar size is approximate.");
  }

  let fills: Fill[] = [];
  let scanned = 0;
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) {
    try {
      const helius = await loadHelius(wallet, heliusKey, solPrice.priceAt);
      fills = helius.fills;
      scanned = helius.scanned;
    } catch (error) {
      warnings.push(`Helius did not answer (${messageOf(error)}). Fell back to a public RPC.`);
    }
  }
  if (fills.length === 0) {
    const rpc = await loadRpc(wallet, solPrice.priceAt, clampDepth(depth));
    fills = rpc.fills;
    scanned = rpc.scanned;
    if (rpc.warning) warnings.push(rpc.warning);
  }

  const metas = await loadMintMeta([...new Set(fills.map((fill) => fill.mint))]);
  const built = buildRoundTrips(fills, metas, terminal);
  if (built.trades.length === 0 && fills.length === 0) {
    warnings.push("No SOL or USDC memecoin swaps showed up in the recent transactions. A CSV export from the terminal still works.");
  }

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
  const rpc = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const sigs = await loadSignatures(rpc, wallet, depth);
  let firstError = "";
  const transactions = await mapPool(sigs, 6, (signature) =>
    rpcCall<ParsedTransaction | null>(rpc, "getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 },
    ]).catch((error: unknown) => {
      if (!firstError) firstError = error instanceof Error ? error.message : "read failed";
      return null;
    }),
  );
  const fills: Fill[] = [];
  transactions.forEach((tx, index) => {
    if (!tx) return;
    const signature = sigs[index];
    const at = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : "";
    const fill = parseRpcTransaction(tx, wallet, priceAt(at), signature);
    if (fill) fills.push(fill);
  });
  const missed = transactions.filter((tx) => tx === null).length;
  const warning =
    sigs.length === 0
      ? "The RPC returned no recent signatures for this address."
      : missed > sigs.length / 2
        ? `Only ${sigs.length - missed} of the last ${sigs.length} transactions could be read${firstError ? ` (${firstError})` : ""}. A Helius key or a CSV export reaches further.`
        : `This read covers the last ${sigs.length} signatures. Older fills need a CSV export, or a Helius key in the server environment.`;
  return { fills, scanned: sigs.length, warning };
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
  });
}

interface DexPair {
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
}

async function loadSolPrices(): Promise<{ priceAt: (iso: string) => number; approximate: boolean }> {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=90",
      { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } },
    );
    if (response.ok) {
      const body = (await response.json()) as { prices?: [number, number][] };
      const prices = (body.prices ?? []).filter((row) => row.length === 2);
      if (prices.length > 0) {
        return {
          approximate: false,
          priceAt(iso: string) {
            const time = Date.parse(iso);
            let nearest = prices[0];
            let best = Infinity;
            for (const row of prices) {
              const gap = Math.abs(row[0] - time);
              if (gap < best) {
                best = gap;
                nearest = row;
              }
            }
            return nearest[1] || prices[prices.length - 1][1];
          },
        };
      }
    }
  } catch {
    // Fall through to a spot price.
  }

  const spot = await loadSpotSol();
  return { approximate: true, priceAt: () => spot };
}

async function loadSpotSol(): Promise<number> {
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
    // Use a last-resort figure so size is still in dollars.
  }
  return 150;
}

async function loadSignatures(rpc: string, wallet: string, depth: number): Promise<string[]> {
  const signatures: string[] = [];
  let before: string | undefined;
  while (signatures.length < depth) {
    const limit = Math.min(1000, depth - signatures.length);
    const page = await rpcCall<{ signature: string }[]>(rpc, "getSignaturesForAddress", [
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

async function rpcCall<T>(rpc: string, method: string, params: unknown[]): Promise<T> {
  let last = "RPC failed";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await rpcCallOnce<T>(rpc, method, params);
    } catch (error) {
      last = error instanceof Error ? error.message : "RPC failed";
      if (!/429|502|503|timeout|timed out|congested/i.test(last) || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw new Error(last);
}

async function rpcCallOnce<T>(rpc: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpc, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`RPC ${method} status ${response.status}: ${detail.slice(0, 180)}`);
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "RPC error");
  return body.result as T;
}

async function mapPool<T, U>(items: T[], concurrency: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "request failed";
}
