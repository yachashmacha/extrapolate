import { NextResponse } from "next/server";
import { highsFor } from "@/lib/ingest/highs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { mints?: unknown } | null;
  const mints = Array.isArray(body?.mints) ? body.mints.filter((mint): mint is string => typeof mint === "string" && mint.length > 0) : [];
  const unique = [...new Set(mints)].slice(0, 80);
  const tapes = await highsFor(unique);
  const highs: Record<string, number> = {};
  for (const [mint, tape] of Object.entries(tapes)) {
    if (tape.highMarketCapUsd != null && tape.highMarketCapUsd > 0) highs[mint] = tape.highMarketCapUsd;
  }
  return NextResponse.json({ highs, tapes });
}
