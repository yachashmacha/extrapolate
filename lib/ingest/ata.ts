import { PublicKey } from "@solana/web3.js";

const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export function associatedTokenAddress(wallet: string, mint: string, tokenProgram: string): string {
  const [address] = PublicKey.findProgramAddressSync(
    [new PublicKey(wallet).toBuffer(), new PublicKey(tokenProgram).toBuffer(), new PublicKey(mint).toBuffer()],
    ATA_PROGRAM,
  );
  return address.toBase58();
}
