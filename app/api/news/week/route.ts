import { NextResponse } from "next/server";
import { loadWeek } from "@/lib/news/week";

export const dynamic = "force-dynamic";

export async function GET() {
  const board = await loadWeek();
  return NextResponse.json(board, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}
