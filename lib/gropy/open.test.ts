import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { holdingSymbols, readHeldMints, walletHoldingSymbols } from "@/lib/gropy/open";
import { booksFromLegs, legFromTransaction } from "@/lib/gropy/swaps";
import type { BuySignal, CopyBook } from "@/lib/gropy/types";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function swapTx(wallet: string, mint: string, lamportPre: number, lamportPost: number, tokenPre: number, tokenPost: number, time: number) {
  return {
    blockTime: time,
    meta: {
      err: null,
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

function book(ids: string[]): CopyBook {
  return {
    copying: null,
    lossesTowardFire: 0,
    copyingRealizedUsd: null,
    copyingCloses: null,
    copies: ids.map((id) => ({ id, wallet: "A", boughtAt: "2026-10-01T12:00:00.000Z", coin: "PEPE" })),
    fires: [],
    switches: [],
    copyingStreak: 0,
    copyingLost: 0,
    skippedUnnamedBuys: 0,
  };
}

describe("gropy open positions", () => {
  it("keeps the unsold part of a copied buy and ignores a coin the bot never copied", () => {
    const wallet = "Wallet11111111111111111111111111111111111";
    const pepe = Keypair.generate().publicKey.toBase58();
    const bonk = Keypair.generate().publicKey.toBase58();
    const pepeBuy = legFromTransaction(wallet, swapTx(wallet, pepe, 2_000_000_000, 1_000_000_000, 0, 100, 1_000), "pepe-buy");
    const pepeSell = legFromTransaction(wallet, swapTx(wallet, pepe, 1_000_000_000, 1_400_000_000, 100, 40, 2_000), "pepe-sell");
    const bonkBuy = legFromTransaction(wallet, swapTx(wallet, bonk, 2_000_000_000, 1_500_000_000, 0, 20, 1_500), "bonk-buy");
    const books = booksFromLegs([pepeBuy!, pepeSell!, bonkBuy!]);
    expect(books.open.map((lot) => lot.tokens)).toEqual([40, 20]);
    const buys: BuySignal[] = books.buys.map((buy) => ({ ...buy, symbol: buy.mint === pepe ? "PEPE" : "BONK" }));
    expect(holdingSymbols(book([buys[0].id]), buys, books.open)).toEqual(["PEPE"]);
    expect(holdingSymbols(book([]), buys, books.open)).toEqual([]);
  });

  it("reads a token the bot wallet holds and skips cash", async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const rpc = async () => ({
      value: [
        { account: { data: { parsed: { info: { mint, tokenAmount: { uiAmount: 12 } } } } } },
        { account: { data: { parsed: { info: { mint: USDC, tokenAmount: { uiAmount: 4 } } } } } },
        { account: { data: { parsed: { info: { mint: Keypair.generate().publicKey.toBase58(), tokenAmount: { uiAmount: 0 } } } } } },
      ],
    });
    const held = await readHeldMints("Bot111111111111111111111111111111111111", rpc);
    expect(held).toEqual([mint]);
    const named = await walletHoldingSymbols([{ mint, symbol: "WIF" }], async () => {
      throw new Error("no wallet");
    });
    expect(named).toEqual([]);
  });
});
