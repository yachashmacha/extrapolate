import type { BuySignal, ClosedTrade } from "@/lib/gropy/types";

const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const QUOTES = new Set([WSOL, USDC, USDT]);
const MIN_SOL = 0.0005;

export interface SwapLeg {
  signature: string;
  wallet: string;
  mint: string;
  side: "buy" | "sell";
  sol: number;
  tokens: number;
  at: string;
}

interface TokenRow {
  owner?: string;
  mint?: string;
  uiTokenAmount?: { uiAmount?: number | null; uiAmountString?: string | null };
}

interface ParsedTx {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: TokenRow[];
    postTokenBalances?: TokenRow[];
  } | null;
  transaction?: {
    signatures?: string[];
    message?: { accountKeys?: Array<string | { pubkey?: string }> };
  };
}

/** One SOL-quoted swap. A token move with no verified SOL size is ignored. */
export function legFromTransaction(wallet: string, value: unknown, signature?: string): SwapLeg | null {
  if (!value || typeof value !== "object") return null;
  const tx = value as ParsedTx;
  if (!tx.meta || tx.meta.err || !tx.blockTime) return null;
  const sig = signature || tx.transaction?.signatures?.[0];
  if (!sig) return null;
  const keys = (tx.transaction?.message?.accountKeys ?? []).map((key) => (typeof key === "string" ? key : key.pubkey || ""));
  const index = keys.indexOf(wallet);
  if (index < 0) return null;
  const pre = tx.meta.preBalances?.[index];
  const post = tx.meta.postBalances?.[index];
  if (typeof pre !== "number" || typeof post !== "number") return null;
  const native = (post - pre) / 1e9;
  const deltas = tokenDeltas(tx.meta.preTokenBalances ?? [], tx.meta.postTokenBalances ?? [], wallet);
  const quote = native + (deltas.get(WSOL) ?? 0);
  const assets = [...deltas.entries()].filter(([mint, amount]) => !QUOTES.has(mint) && Math.abs(amount) > 0);
  if (assets.length !== 1) return null;
  const [mint, tokenDelta] = assets[0];
  if (tokenDelta > 0 && quote < -MIN_SOL) {
    return { signature: sig, wallet, mint, side: "buy", sol: -quote, tokens: tokenDelta, at: new Date(tx.blockTime * 1000).toISOString() };
  }
  if (tokenDelta < 0 && quote > MIN_SOL) {
    return { signature: sig, wallet, mint, side: "sell", sol: quote, tokens: -tokenDelta, at: new Date(tx.blockTime * 1000).toISOString() };
  }
  return null;
}

/** Pair buys and sells. A sell with no buy in this read is skipped, not given an invented entry. */
export function booksFromLegs(legs: readonly SwapLeg[]): { closed: ClosedTrade[]; buys: BuySignal[] } {
  const closed: ClosedTrade[] = [];
  const buys: BuySignal[] = [];
  const byMint = new Map<string, SwapLeg[]>();
  for (const leg of [...legs].sort((left, right) => left.at.localeCompare(right.at) || left.signature.localeCompare(right.signature))) {
    const rows = byMint.get(leg.mint) ?? [];
    rows.push(leg);
    byMint.set(leg.mint, rows);
  }
  for (const [mint, rows] of byMint) {
    let tokens = 0;
    let cost = 0;
    for (const leg of rows) {
      if (leg.side === "buy") {
        tokens += leg.tokens;
        cost += leg.sol;
        buys.push({
          id: `${leg.signature}|${mint}`,
          wallet: leg.wallet,
          mint,
          boughtAt: leg.at,
          amountSol: leg.sol,
        });
        continue;
      }
      if (!(tokens > 0) || !(leg.tokens > 0) || !(leg.sol > 0)) continue;
      const matched = Math.min(leg.tokens, tokens);
      const costOut = cost * (matched / tokens);
      const proceeds = leg.sol * (matched / leg.tokens);
      if (!Number.isFinite(costOut) || !Number.isFinite(proceeds)) continue;
      closed.push({
        id: `${leg.signature}|${mint}`,
        wallet: leg.wallet,
        mint,
        closedAt: leg.at,
        pnlSol: proceeds - costOut,
        amountSol: costOut,
      });
      tokens -= matched;
      cost -= costOut;
      if (tokens <= 1e-9) {
        tokens = 0;
        cost = 0;
      }
    }
  }
  return { closed, buys };
}

export function decodeTokenName(data: Uint8Array): { name: string; symbol: string } | null {
  if (data.length < 70) return null;
  const name = readBorshString(data, 1 + 32 + 32);
  if (!name) return null;
  const symbol = readBorshString(data, name.next);
  if (!symbol) return null;
  return {
    name: name.value.replace(/\0/g, "").trim(),
    symbol: symbol.value.replace(/\0/g, "").trim(),
  };
}

function readBorshString(data: Uint8Array, offset: number): { value: string; next: number } | null {
  if (offset + 4 > data.length) return null;
  const length = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
  if (length < 0 || length > 200 || offset + 4 + length > data.length) return null;
  return {
    value: new TextDecoder().decode(data.subarray(offset + 4, offset + 4 + length)),
    next: offset + 4 + length,
  };
}

function tokenDeltas(pre: TokenRow[], post: TokenRow[], wallet: string): Map<string, number> {
  const totals = new Map<string, number>();
  const add = (rows: TokenRow[], sign: number) => {
    for (const row of rows) {
      if (row.owner !== wallet || !row.mint) continue;
      const amount = uiAmount(row);
      if (amount == null) continue;
      totals.set(row.mint, (totals.get(row.mint) ?? 0) + sign * amount);
    }
  };
  add(pre, -1);
  add(post, 1);
  return totals;
}

function uiAmount(row: TokenRow): number | null {
  const token = row.uiTokenAmount;
  if (!token) return null;
  if (typeof token.uiAmount === "number" && Number.isFinite(token.uiAmount)) return token.uiAmount;
  if (token.uiAmountString) {
    const parsed = Number(token.uiAmountString);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
