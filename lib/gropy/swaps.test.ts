import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadKolRecords } from "@/lib/gropy/chain";
import { eligibleWallets, runCopyBook } from "@/lib/gropy/engine";
import { booksFromLegs, decodeTokenName, legFromTransaction } from "@/lib/gropy/swaps";

function swapTx(wallet: string, mint: string, lamportPre: number, lamportPost: number, tokenPre: number, tokenPost: number, time: number) {
  return {
    blockTime: time,
    meta: {
      err: null,
      fee: 5000,
      preBalances: [lamportPre],
      postBalances: [lamportPost],
      preTokenBalances: [{ owner: wallet, mint, uiTokenAmount: { uiAmount: tokenPre } }],
      postTokenBalances: [{ owner: wallet, mint, uiTokenAmount: { uiAmount: tokenPost } }],
    },
    transaction: {
      signatures: [`sig-${time}`],
      message: { accountKeys: [{ pubkey: wallet }] },
    },
  };
}

describe("gropy swap reads", () => {
  it("builds a close from a buy and a sell, and does not invent an entry for a sell alone", () => {
    const wallet = "Wallet11111111111111111111111111111111111";
    const mint = Keypair.generate().publicKey.toBase58();
    const buy = legFromTransaction(wallet, swapTx(wallet, mint, 2_000_000_000, 1_000_000_000, 0, 100, 1_000), "buy-sig");
    const sell = legFromTransaction(wallet, swapTx(wallet, mint, 1_000_000_000, 1_400_000_000, 100, 0, 2_000), "sell-sig");
    expect(buy?.side).toBe("buy");
    expect(sell?.side).toBe("sell");
    const paired = booksFromLegs([sell!, buy!]);
    expect(paired.closed).toHaveLength(1);
    expect(paired.closed[0].pnlSol).toBeCloseTo(-0.6, 6);
    expect(paired.closed[0]).not.toHaveProperty("pnlUsd");
    expect(paired.buys[0].amountSol).toBeCloseTo(1, 6);
    expect(paired.open).toEqual([]);

    const orphan = booksFromLegs([sell!]);
    expect(orphan.closed).toEqual([]);
    expect(eligibleWallets(orphan.closed)).toEqual([]);
    expect(runCopyBook(orphan.closed, orphan.buys).copying).toBeNull();
  });

  it("skips a wallet whose closes cannot be read and does not copy one with no close", async () => {
    const traded = Keypair.generate().publicKey.toBase58();
    const empty = Keypair.generate().publicKey.toBase58();
    const broken = Keypair.generate().publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();
    const cachePath = path.join(mkdtempSync(path.join(tmpdir(), "gropy-chain-")), "cache.json");
    const rpc = async (method: string, params: unknown[]) => {
      const wallet = params[0];
      if (wallet === broken) throw new Error("rpc down");
      if (method === "getSignaturesForAddress") {
        if (wallet === empty) return [];
        return [
          { signature: "buy-sig", err: null },
          { signature: "sell-sig", err: null },
        ];
      }
      if (method === "getTransaction") {
        const signature = params[0];
        if (signature === "buy-sig") return swapTx(traded, mint, 2_000_000_000, 1_000_000_000, 0, 10, 1_000);
        return swapTx(traded, mint, 1_000_000_000, 2_500_000_000, 10, 0, 2_000);
      }
      throw new Error(method);
    };
    const read = await loadKolRecords({
      wallets: [{ wallet: traded }, { wallet: empty }, { wallet: broken }],
      cachePath,
      budgetMs: 5_000,
      rpc,
      signatureLimit: 10,
      txLimit: 10,
    });
    expect(read.unreadable).toBe(1);
    expect(read.skippedWallets).toContain(empty);
    expect(read.closed.map((trade) => trade.wallet)).toEqual([traded]);
    expect(read.closed[0].pnlSol).toBeGreaterThan(0);
    expect(read.closed.some((trade) => trade.wallet === broken || trade.wallet === empty)).toBe(false);
    expect(read.open).toEqual([]);
    const book = runCopyBook(read.closed, read.buys);
    expect(book.copying).toBe(traded);
    expect(book.copying).not.toBe(empty);
    expect(book.copying).not.toBe(broken);
    expect(eligibleWallets(read.closed.filter((trade) => trade.wallet === empty))).toEqual([]);
  });

  it("reads a token name from metadata bytes", () => {
    const bytes = new Uint8Array(1 + 32 + 32 + 4 + 4 + 4 + 3);
    let offset = 1 + 32 + 32;
    bytes[offset] = 4;
    offset += 4;
    bytes.set(new TextEncoder().encode("PEPE"), offset);
    offset += 4;
    bytes[offset] = 3;
    offset += 4;
    bytes.set(new TextEncoder().encode("PEP"), offset);
    expect(decodeTokenName(bytes)).toEqual({ name: "PEPE", symbol: "PEP" });
  });
});
