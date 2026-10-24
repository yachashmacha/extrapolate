import { describe, expect, it } from "vitest";
import { parseHeliusTransaction, parseRpcTransaction, type ParsedTransaction } from "@/lib/ingest/parse";
import { buildRoundTrips } from "@/lib/ingest/round-trips";
import type { Fill } from "@/lib/ingest/parse";

const WALLET = "Wallet1111111111111111111111111111111111";
const MINT = "Mint111111111111111111111111111111111111";

describe("rpc parser", () => {
  it("reads a SOL-for-token buy from balance changes", () => {
    const tx: ParsedTransaction = {
      blockTime: 1_760_000_000,
      meta: {
        err: null,
        fee: 5_000,
        preBalances: [2_000_000_000],
        postBalances: [1_000_000_000],
        preTokenBalances: [],
        postTokenBalances: [
          {
            accountIndex: 1,
            mint: MINT,
            owner: WALLET,
            uiTokenAmount: { uiAmount: 1_000 },
          },
        ],
      },
      transaction: {
        message: { accountKeys: [{ pubkey: WALLET, signer: true }] },
      },
    };
    const fill = parseRpcTransaction(tx, WALLET, 100, "sig");
    expect(fill?.side).toBe("buy");
    expect(fill?.mint).toBe(MINT);
    expect(fill?.tokenAmount).toBe(1_000);
    expect(fill?.usd).toBeCloseTo(100, 0);
  });

  it("reads token-2022 amounts when uiAmount is null", () => {
    const tx: ParsedTransaction = {
      blockTime: 1_760_000_000,
      meta: {
        err: null,
        fee: 5_000,
        preBalances: [2_000_000_000],
        postBalances: [1_000_000_000],
        preTokenBalances: [],
        postTokenBalances: [
          {
            accountIndex: 1,
            mint: MINT,
            owner: WALLET,
            uiTokenAmount: { uiAmount: null, uiAmountString: "2500.5", decimals: 6, amount: "2500500000" },
          },
        ],
      },
      transaction: { message: { accountKeys: [{ pubkey: WALLET, signer: true }] } },
    };
    const fill = parseRpcTransaction(tx, WALLET, 100, "sig");
    expect(fill?.tokenAmount).toBeCloseTo(2500.5, 3);
    expect(fill?.side).toBe("buy");
  });

  it("ignores failed transactions", () => {
    const fill = parseRpcTransaction(
      { blockTime: 1, meta: { err: { InstructionError: [0, "x"] } }, transaction: { message: { accountKeys: [WALLET] } } },
      WALLET,
      100,
      "sig",
    );
    expect(fill).toBeNull();
  });
});

describe("helius parser", () => {
  it("reads a swap event", () => {
    const fill = parseHeliusTransaction(
      {
        signature: "abc",
        timestamp: 1_760_000_000,
        type: "SWAP",
        events: {
          swap: {
            nativeInput: { account: WALLET, amount: "2000000000" },
            tokenOutputs: [
              {
                mint: MINT,
                userAccount: WALLET,
                rawTokenAmount: { tokenAmount: "5000000", decimals: 6 },
              },
            ],
          },
        },
      },
      WALLET,
      150,
    );
    expect(fill?.side).toBe("buy");
    expect(fill?.tokenAmount).toBeCloseTo(5, 5);
    expect(fill?.usd).toBeCloseTo(300, 0);
  });
});

describe("round trips", () => {
  it("closes a buy and a full sell into one trade", () => {
    const fills: Fill[] = [
      { signature: "a", at: "2026-10-01T14:00:00Z", mint: MINT, side: "buy", tokenAmount: 100, usd: 100 },
      { signature: "b", at: "2026-10-01T14:20:00Z", mint: MINT, side: "sell", tokenAmount: 100, usd: 140 },
    ];
    const built = buildRoundTrips(
      fills,
      new Map([[MINT, { symbol: "BONKO", name: "Bonko", supply: 1_000_000, liquidityUsd: 40_000 }]]),
      "axiom",
    );
    expect(built.opens).toHaveLength(0);
    expect(built.trades).toHaveLength(1);
    expect(built.trades[0].pnlUsd).toBe(40);
    expect(built.trades[0].entryMarketCapUsd).toBe(1_000_000);
    expect(built.trades[0].holdMinutes).toBe(20);
    expect(built.trades[0].symbol).toBe("BONKO");
  });

  it("keeps a still-open position out of the win rate set", () => {
    const fills: Fill[] = [
      { signature: "a", at: "2026-10-01T14:00:00Z", mint: MINT, side: "buy", tokenAmount: 50, usd: 80 },
    ];
    const built = buildRoundTrips(fills, new Map(), "photon");
    expect(built.trades).toHaveLength(0);
    expect(built.opens[0].costUsd).toBe(80);
  });
});
