import { NextResponse } from "next/server";
import { kolScanSnapshot, startKolScan } from "@/lib/ingest/kol-scan";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { mints?: unknown } | null;
  const mints = Array.isArray(body?.mints)
    ? body.mints.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const mint = (row as { mint?: unknown }).mint;
        const entryAt = (row as { entryAt?: unknown }).entryAt;
        if (typeof mint !== "string" || typeof entryAt !== "string") return [];
        return [{ mint, entryAt }];
      })
    : [];
  const unique = mints.slice(0, 80);
  startKolScan(unique);
  return NextResponse.json(kolScanSnapshot(unique.map((row) => row.mint)));
}
