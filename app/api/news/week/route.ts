import { NextResponse } from "next/server";
import { loadWeek } from "@/lib/news/week";

export const dynamic = "force-dynamic";

export async function GET() {
  const board = await loadWeek();
  return NextResponse.json(board);
}
