import { NextResponse } from "next/server";
import { isWalletAddress } from "@/lib/address";
import { readSolBalance } from "@/lib/gropy/wallet";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!isWalletAddress(address)) {
    return NextResponse.json({ error: "That is not a Solana wallet address." }, { status: 400 });
  }
  const balanceSol = await readSolBalance(address);
  return NextResponse.json({ address, balanceSol });
}
