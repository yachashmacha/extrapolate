export interface Fill {
  signature: string;
  at: string;
  mint: string;
  side: "buy" | "sell";
  tokenAmount: number;
  usd: number;
}

export const QUOTE_MINTS = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const WSOL = "So11111111111111111111111111111111111111112";

interface TokenAmount {
  uiAmount?: number | null;
  uiAmountString?: string | null;
  decimals?: number;
  amount?: string;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: TokenAmount;
}

interface AccountKey {
  pubkey: string;
  signer?: boolean;
}

export interface ParsedTransaction {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
  transaction?: {
    signatures?: string[];
    message?: {
      accountKeys?: Array<string | AccountKey>;
    };
  };
}

export function parseRpcTransaction(
  tx: ParsedTransaction,
  wallet: string,
  solPriceUsd: number,
  signature: string,
): Fill | null {
  if (!tx.meta || tx.meta.err || !tx.blockTime) return null;
  const keys = (tx.transaction?.message?.accountKeys ?? []).map((key) =>
    typeof key === "string" ? key : key.pubkey,
  );
  const index = keys.indexOf(wallet);
  if (index < 0) return null;

  const fee = tx.meta.fee ?? 0;
  const pre = tx.meta.preBalances?.[index] ?? 0;
  const post = tx.meta.postBalances?.[index] ?? 0;
  const nativeDelta = (post - pre + fee) / 1e9;
  const deltas = tokenDeltas(tx.meta.preTokenBalances ?? [], tx.meta.postTokenBalances ?? [], wallet);

  let quoteUsd = nativeDelta * solPriceUsd;
  const wsol = deltas.get(WSOL) ?? 0;
  quoteUsd += wsol * solPriceUsd;
  const usdc = deltas.get(USDC) ?? 0;
  const usdt = deltas.get(USDT) ?? 0;
  quoteUsd += usdc + usdt;

  const assets = [...deltas.entries()].filter(([mint, amount]) => !QUOTE_MINTS.has(mint) && Math.abs(amount) > 0);
  if (assets.length !== 1) return null;
  const [mint, tokenDelta] = assets[0];
  if (tokenDelta > 0 && quoteUsd < -0.5) {
    return fill(signature, tx.blockTime, mint, "buy", tokenDelta, Math.abs(quoteUsd));
  }
  if (tokenDelta < 0 && quoteUsd > 0.5) {
    return fill(signature, tx.blockTime, mint, "sell", Math.abs(tokenDelta), quoteUsd);
  }
  return null;
}

interface HeliusAmount {
  mint?: string;
  userAccount?: string;
  rawTokenAmount?: { tokenAmount?: string; decimals?: number };
}

export interface HeliusTransaction {
  signature?: string;
  timestamp?: number;
  type?: string;
  events?: {
    swap?: {
      nativeInput?: { account?: string; amount?: string | number };
      nativeOutput?: { account?: string; amount?: string | number };
      tokenInputs?: HeliusAmount[];
      tokenOutputs?: HeliusAmount[];
    };
  };
}

export function parseHeliusTransaction(tx: HeliusTransaction, wallet: string, solPriceUsd: number): Fill | null {
  const swap = tx.events?.swap;
  if (!swap || !tx.timestamp || !tx.signature) return null;
  const outputs = (swap.tokenOutputs ?? []).filter((row) => row.userAccount === wallet && row.mint && !QUOTE_MINTS.has(row.mint));
  const inputs = (swap.tokenInputs ?? []).filter((row) => row.userAccount === wallet && row.mint && !QUOTE_MINTS.has(row.mint));
  const nativeIn = lamports(swap.nativeInput?.amount);
  const nativeOut = lamports(swap.nativeOutput?.amount);

  if (outputs.length === 1 && nativeIn > 0) {
    const amount = uiAmount(outputs[0]);
    if (amount <= 0) return null;
    return fill(tx.signature, tx.timestamp, outputs[0].mint!, "buy", amount, (nativeIn / 1e9) * solPriceUsd);
  }
  if (inputs.length === 1 && nativeOut > 0) {
    const amount = uiAmount(inputs[0]);
    if (amount <= 0) return null;
    return fill(tx.signature, tx.timestamp, inputs[0].mint!, "sell", amount, (nativeOut / 1e9) * solPriceUsd);
  }
  return null;
}

function fill(signature: string, unixSeconds: number, mint: string, side: "buy" | "sell", tokenAmount: number, usd: number): Fill {
  return {
    signature,
    at: new Date(unixSeconds * 1000).toISOString(),
    mint,
    side,
    tokenAmount,
    usd: Math.round(usd * 100) / 100,
  };
}

function uiAmountOf(row: TokenBalance): number {
  const token = row.uiTokenAmount;
  if (!token) return 0;
  if (typeof token.uiAmount === "number") return token.uiAmount;
  if (token.uiAmountString) {
    const parsed = Number(token.uiAmountString);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (token.amount && typeof token.decimals === "number") {
    const raw = Number(token.amount);
    if (Number.isFinite(raw)) return raw / 10 ** token.decimals;
  }
  return 0;
}

function tokenDeltas(pre: TokenBalance[], post: TokenBalance[], wallet: string): Map<string, number> {
  const totals = new Map<string, number>();
  const add = (rows: TokenBalance[], sign: number) => {
    for (const row of rows) {
      if (row.owner !== wallet || !row.mint) continue;
      const amount = uiAmountOf(row);
      totals.set(row.mint, (totals.get(row.mint) ?? 0) + sign * amount);
    }
  };
  add(pre, -1);
  add(post, 1);
  return totals;
}

function lamports(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uiAmount(row: HeliusAmount): number {
  const raw = Number(row.rawTokenAmount?.tokenAmount ?? 0);
  const decimals = row.rawTokenAmount?.decimals ?? 0;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw / 10 ** decimals;
}
