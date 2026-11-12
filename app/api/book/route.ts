import { NextResponse } from "next/server";
import { fetchWalletBook } from "@/lib/ingest/live";
import { softenRpcText } from "@/lib/ingest/rpc-message";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const terminal = searchParams.get("terminal");
  const depth = Number(searchParams.get("depth") ?? "200");
  try {
    const book = await fetchWalletBook(address, terminal, depth);
    return NextResponse.json(book);
  } catch (error) {
    const message = softenRpcText(error instanceof Error ? error.message : "The wallet could not be read.");
    const status = /does not look like a Solana address/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
