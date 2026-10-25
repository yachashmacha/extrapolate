import { NextResponse } from "next/server";
import { biasContextFor, type BiasTrade } from "@/lib/ingest/bias-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { trades?: unknown } | null;
  const trades = Array.isArray(body?.trades) ? body.trades.map(asTrade).filter((trade): trade is BiasTrade => trade !== null) : [];
  const unique = new Map<string, BiasTrade>();
  for (const trade of trades) {
    if (!unique.has(trade.id)) unique.set(trade.id, trade);
  }
  const reads = await biasContextFor([...unique.values()].slice(0, 120));
  return NextResponse.json({ reads });
}

function asTrade(value: unknown): BiasTrade | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { id?: unknown; mint?: unknown; entryAt?: unknown; entryMarketCapUsd?: unknown };
  if (typeof row.id !== "string" || typeof row.mint !== "string" || typeof row.entryAt !== "string") return null;
  const entryMarketCapUsd = Number(row.entryMarketCapUsd ?? 0);
  if (!row.id || !row.mint || !Number.isFinite(entryMarketCapUsd)) return null;
  return { id: row.id, mint: row.mint, entryAt: row.entryAt, entryMarketCapUsd };
}
