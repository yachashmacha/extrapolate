import { classifyMeta } from "@/lib/metas";
import type { MetaId, OpenPosition, RoundTrip, TerminalId } from "@/lib/types";
import type { Fill } from "@/lib/ingest/parse";

export interface MintMeta {
  symbol: string;
  name: string;
  supply: number;
  liquidityUsd: number;
  metas?: MetaId[];
  /** Highest-liquidity pair, used to read the coin's high. */
  pairAddress?: string;
  athMarketCapUsd?: number;
}

interface OpenLot {
  mint: string;
  tokens: number;
  costRemaining: number;
  costTotal: number;
  proceeds: number;
  tokensIn: number;
  tokensOut: number;
  entryAt: string;
  lastAt: string;
  buys: number;
  sells: number;
}

export function buildRoundTrips(
  fills: Fill[],
  metas: Map<string, MintMeta>,
  terminal: TerminalId,
): { trades: RoundTrip[]; opens: OpenPosition[] } {
  const lots = new Map<string, OpenLot>();
  const closed: RoundTrip[] = [];
  const ordered = [...fills].sort((a, b) => a.at.localeCompare(b.at));

  for (const fill of ordered) {
    if (fill.tokenAmount <= 0 || fill.usd < 1) continue;
    const lot = lots.get(fill.mint) ?? emptyLot(fill);
    if (fill.side === "buy") {
      lot.tokens += fill.tokenAmount;
      lot.costRemaining += fill.usd;
      lot.costTotal += fill.usd;
      lot.tokensIn += fill.tokenAmount;
      lot.buys += 1;
      lot.lastAt = fill.at;
      if (lot.entryAt === "") lot.entryAt = fill.at;
      lots.set(fill.mint, lot);
      continue;
    }
    if (lot.tokens <= 0 || lot.entryAt === "") continue;
    const sold = Math.min(fill.tokenAmount, lot.tokens);
    const fraction = sold / fill.tokenAmount;
    const average = lot.costRemaining / lot.tokens;
    lot.costRemaining -= average * sold;
    lot.tokens -= sold;
    lot.proceeds += fill.usd * fraction;
    lot.tokensOut += sold;
    lot.sells += 1;
    lot.lastAt = fill.at;
    if (lot.tokens <= lot.tokensIn * 0.02) {
      closed.push(toTrip(lot, metas, terminal));
      lots.delete(fill.mint);
    } else {
      lots.set(fill.mint, lot);
    }
  }

  const opens: OpenPosition[] = [];
  for (const lot of lots.values()) {
    if (lot.tokens <= 0 || lot.costRemaining < 1) continue;
    const info = metas.get(lot.mint);
    const supply = info?.supply ?? 0;
    const entryPrice = lot.tokensIn > 0 ? lot.costTotal / lot.tokensIn : 0;
    opens.push({
      mint: lot.mint,
      symbol: info?.symbol || shortMint(lot.mint),
      name: info?.name || info?.symbol || shortMint(lot.mint),
      tokens: lot.tokens,
      costUsd: round(lot.costRemaining),
      entryAt: lot.entryAt,
      entryMarketCapUsd: supply > 0 ? round(entryPrice * supply) : 0,
      metas: info?.metas ?? classifyMeta(info?.name ?? "", info?.symbol ?? ""),
    });
  }

  return { trades: closed, opens };
}

function toTrip(lot: OpenLot, metas: Map<string, MintMeta>, terminal: TerminalId): RoundTrip {
  const info = metas.get(lot.mint);
  const supply = info?.supply ?? 0;
  const entryPrice = lot.tokensIn > 0 ? lot.costTotal / lot.tokensIn : 0;
  const exitPrice = lot.tokensOut > 0 ? lot.proceeds / lot.tokensOut : 0;
  const pnl = lot.proceeds - lot.costTotal;
  const symbol = info?.symbol || shortMint(lot.mint);
  const name = info?.name || symbol;
  return {
    id: `${lot.mint.slice(0, 6)}-${lot.entryAt}`,
    mint: lot.mint,
    symbol,
    name,
    metas: info?.metas ?? classifyMeta(name, symbol),
    terminal,
    entryAt: lot.entryAt,
    exitAt: lot.lastAt,
    entryMarketCapUsd: supply > 0 ? round(entryPrice * supply) : 0,
    exitMarketCapUsd: supply > 0 ? round(exitPrice * supply) : 0,
    liquidityUsd: info?.liquidityUsd ?? 0,
    amountUsd: round(lot.costTotal),
    pnlUsd: round(pnl),
    pnlPct: lot.costTotal > 0 ? (pnl / lot.costTotal) * 100 : 0,
    holdMinutes: Math.max(0, (Date.parse(lot.lastAt) - Date.parse(lot.entryAt)) / 60_000),
    kols: [],
    minutesFromLaunch: -1,
    buys: lot.buys,
    sells: lot.sells,
    athMarketCapUsd: info?.athMarketCapUsd,
  };
}

function emptyLot(fill: Fill): OpenLot {
  return {
    mint: fill.mint,
    tokens: 0,
    costRemaining: 0,
    costTotal: 0,
    proceeds: 0,
    tokensIn: 0,
    tokensOut: 0,
    entryAt: "",
    lastAt: fill.at,
    buys: 0,
    sells: 0,
  };
}

function shortMint(mint: string): string {
  return mint.slice(0, 4).toUpperCase();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
