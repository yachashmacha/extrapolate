import { runCopyBook } from "@/lib/gropy/engine";
import { loadKolRecords } from "@/lib/gropy/chain";
import { gropyRpc } from "@/lib/gropy/rpc";
import type { BuySignal, CopyBook, OpenLot } from "@/lib/gropy/types";
import { savedBotAddress } from "@/lib/gropy/wallet";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const CASH = new Set([WSOL, USDC, USDT]);

/**
 * Symbols the bot still has open: a buy it copied, of a lot that has not been sold out.
 * A coin that was only named, or a copy that already closed, is not included.
 */
export function holdingSymbols(book: CopyBook, buys: readonly BuySignal[], open: readonly OpenLot[]): string[] {
  const copied = new Set(book.copies.map((fill) => fill.id));
  const named = new Map(buys.filter((buy) => buy.symbol?.trim()).map((buy) => [buy.id, buy.symbol!.trim()]));
  const symbols: string[] = [];
  const seen = new Set<string>();
  for (const lot of open) {
    if (!(lot.tokens > 0) || !copied.has(lot.id)) continue;
    const symbol = named.get(lot.id);
    if (!symbol) continue;
    const key = symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    symbols.push(symbol);
  }
  return symbols;
}

/** Named coins the saved bot wallet is holding. No wallet file means nothing is held. */
export async function walletHoldingSymbols(
  named: readonly { mint: string; symbol?: string }[],
  rpc: (method: string, params: unknown[]) => Promise<unknown> = gropyRpc,
): Promise<string[]> {
  const address = savedBotAddress();
  if (!address) return [];
  let mints: string[] = [];
  try {
    mints = await readHeldMints(address, rpc);
  } catch {
    return [];
  }
  const byMint = new Map<string, string>();
  for (const row of named) {
    const symbol = row.symbol?.trim();
    if (!symbol || byMint.has(row.mint)) continue;
    byMint.set(row.mint, symbol);
  }
  const symbols: string[] = [];
  const seen = new Set<string>();
  for (const mint of mints) {
    const symbol = byMint.get(mint);
    if (!symbol) continue;
    const key = symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    symbols.push(symbol);
  }
  return symbols;
}

export async function gropyOpenSymbols(): Promise<string[]> {
  try {
    const records = await loadKolRecords();
    const book = runCopyBook(records.closed, records.buys);
    const copied = holdingSymbols(book, records.buys, records.open);
    const wallet = await walletHoldingSymbols(records.buys);
    return unique([...copied, ...wallet]);
  } catch {
    return [];
  }
}

export async function readHeldMints(
  address: string,
  rpc: (method: string, params: unknown[]) => Promise<unknown>,
): Promise<string[]> {
  const mints = new Set<string>();
  for (const programId of [TOKEN_PROGRAM, TOKEN_2022]) {
    try {
      const result = await rpc("getTokenAccountsByOwner", [address, { programId }, { encoding: "jsonParsed" }]);
      for (const mint of mintsIn(result)) {
        if (!CASH.has(mint)) mints.add(mint);
      }
    } catch {
      // That token program did not answer. The other one can still name a holding.
    }
  }
  return [...mints];
}

function unique(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const symbol of symbols) {
    const key = symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(symbol);
  }
  return out;
}

function mintsIn(result: unknown): string[] {
  const value = result && typeof result === "object" && "value" in result ? (result as { value?: unknown }).value : null;
  if (!Array.isArray(value)) return [];
  const mints: string[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const account = (row as { account?: { data?: { parsed?: { info?: { mint?: unknown; tokenAmount?: { uiAmount?: unknown; uiAmountString?: unknown } } } } } }).account;
    const info = account?.data?.parsed?.info;
    const mint = info?.mint;
    const amount = uiAmount(info?.tokenAmount);
    if (typeof mint !== "string" || mint.length < 32 || amount == null || !(amount > 0)) continue;
    mints.push(mint);
  }
  return mints;
}

function uiAmount(token: { uiAmount?: unknown; uiAmountString?: unknown } | undefined): number | null {
  if (!token) return null;
  if (typeof token.uiAmount === "number" && Number.isFinite(token.uiAmount)) return token.uiAmount;
  if (typeof token.uiAmountString === "string") {
    const parsed = Number(token.uiAmountString);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
