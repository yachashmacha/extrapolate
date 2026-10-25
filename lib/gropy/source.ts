import { readFileSync } from "node:fs";
import { TRACKED_KOLS } from "@/lib/kols";
import type { BuySignal, ClosedTrade } from "@/lib/gropy/types";

/** Buy times the app already cached. A positive value is a buy time. Zero is a checked miss. */
export const KOL_SCAN_CACHE = "/tmp/extrapolate-kols.json";

/** Optional verified closes. Absent means there is nothing to score. */
export const CLOSED_TRADE_CACHE = "/tmp/extrapolate-gropy-closes.json";

export interface GropySource {
  catalogSize: number;
  closed: ClosedTrade[];
  buys: BuySignal[];
  /** Catalog wallets with a buy time on file and no verified close. */
  buyOnlyWallets: string[];
}

export function buysFromKolScan(cache: unknown): BuySignal[] {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) return [];
  const buys: BuySignal[] = [];
  for (const [key, value] of Object.entries(cache)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    const splitAt = key.indexOf("|");
    if (splitAt <= 0) continue;
    const wallet = key.slice(0, splitAt);
    const mint = key.slice(splitAt + 1);
    if (!wallet || !mint) continue;
    buys.push({
      id: key,
      wallet,
      mint,
      boughtAt: new Date(value * 1000).toISOString(),
    });
  }
  return buys;
}

export function closedFromUnknown(value: unknown): ClosedTrade[] {
  if (!Array.isArray(value)) return [];
  const trades: ClosedTrade[] = [];
  for (const row of value) {
    const trade = closedRow(row);
    if (trade) trades.push(trade);
  }
  return trades;
}

export function loadGropySource(
  readScan: () => unknown = () => readJson(KOL_SCAN_CACHE),
  readCloses: () => unknown = () => readJson(CLOSED_TRADE_CACHE),
): GropySource {
  const catalog = new Set(TRACKED_KOLS.map((kol) => kol.wallet));
  const buys = buysFromKolScan(readScan()).filter((buy) => catalog.has(buy.wallet));
  const closed = closedFromUnknown(readCloses()).filter((trade) => catalog.has(trade.wallet));
  const closedWallets = new Set(closed.map((trade) => trade.wallet));
  const buyOnlyWallets = [...new Set(buys.map((buy) => buy.wallet))].filter((wallet) => !closedWallets.has(wallet));
  return {
    catalogSize: catalog.size,
    closed,
    buys,
    buyOnlyWallets,
  };
}

function closedRow(row: unknown): ClosedTrade | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.wallet !== "string" || !record.wallet) return null;
  if (typeof record.closedAt !== "string" || !Number.isFinite(Date.parse(record.closedAt))) return null;
  if (typeof record.pnlUsd !== "number" || !Number.isFinite(record.pnlUsd)) return null;
  const mint = typeof record.mint === "string" ? record.mint : undefined;
  const id = typeof record.id === "string" && record.id ? record.id : `${record.wallet}|${record.closedAt}|${record.pnlUsd}`;
  const trade: ClosedTrade = {
    id,
    wallet: record.wallet,
    closedAt: record.closedAt,
    pnlUsd: record.pnlUsd,
  };
  if (mint) trade.mint = mint;
  const symbol = typeof record.symbol === "string" ? record.symbol.trim() : "";
  const coinName = typeof record.coinName === "string" ? record.coinName.trim() : "";
  if (symbol) trade.symbol = symbol;
  if (coinName) trade.coinName = coinName;
  if (typeof record.amountUsd === "number" && Number.isFinite(record.amountUsd)) trade.amountUsd = record.amountUsd;
  if (typeof record.entryMarketCapUsd === "number" && Number.isFinite(record.entryMarketCapUsd)) {
    trade.entryMarketCapUsd = record.entryMarketCapUsd;
  }
  return trade;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}
