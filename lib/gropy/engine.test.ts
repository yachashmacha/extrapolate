import { describe, expect, it } from "vitest";
import { eligibleWallets, FIRE_LOSS_LIMIT, isFired, lossCount, pickReplacement, runCopyBook, walletResult } from "@/lib/gropy/engine";
import type { BuySignal, ClosedTrade, WalletScore } from "@/lib/gropy/types";

function close(wallet: string, at: string, pnlUsd: number): ClosedTrade {
  return {
    id: `${wallet}-${at}`,
    wallet,
    mint: "mint",
    closedAt: at,
    pnlUsd,
    symbol: "COIN",
    coinName: "Coin",
  };
}

function buy(wallet: string, at: string, symbol?: string, stats?: { amountUsd?: number; entryMarketCapUsd?: number }): BuySignal {
  const row: BuySignal = {
    id: `buy-${wallet}-${at}`,
    wallet,
    mint: "mint",
    boughtAt: at,
  };
  if (symbol) {
    row.symbol = symbol;
    row.coinName = symbol;
  }
  if (typeof stats?.amountUsd === "number") row.amountUsd = stats.amountUsd;
  if (typeof stats?.entryMarketCapUsd === "number") row.entryMarketCapUsd = stats.entryMarketCapUsd;
  return row;
}

describe("gropy copy rule", () => {
  it("does not fire on two losses", () => {
    const trades = [
      close("A", "2026-10-01T12:00:00.000Z", 30),
      close("A", "2026-10-01T13:00:00.000Z", -5),
      close("A", "2026-10-01T14:00:00.000Z", -5),
    ];
    expect(FIRE_LOSS_LIMIT).toBe(2);
    expect(lossCount(trades)).toBe(2);
    expect(isFired(2)).toBe(false);
    expect(isFired(lossCount(trades.slice(1)))).toBe(false);

    const book = runCopyBook(trades, [buy("A", "2026-10-01T12:30:00.000Z", "PEPE")]);
    expect(book.copying).toBe("A");
    expect(book.lossesTowardFire).toBe(2);
    expect(book.fires).toEqual([]);
    expect(book.copies.map((fill) => fill.coin)).toEqual(["PEPE"]);
  });

  it("fires on the third loss", () => {
    const book = runCopyBook(
      [
        close("A", "2026-10-01T12:00:00.000Z", 30),
        close("A", "2026-10-01T13:00:00.000Z", -5),
        close("A", "2026-10-01T14:00:00.000Z", -5),
        close("A", "2026-10-01T15:00:00.000Z", -5),
      ],
      [buy("A", "2026-10-01T12:30:00.000Z", "PEPE"), buy("A", "2026-10-01T15:30:00.000Z", "LATE")],
    );
    expect(isFired(3)).toBe(true);
    expect(book.fires).toHaveLength(1);
    expect(book.fires[0].losses).toBe(3);
    expect(book.switches).toHaveLength(1);
    expect(book.switches[0]).toMatchObject({ fromWallet: "A", toWallet: null, trigger: "losses", losses: 3, streak: 3 });
    expect(book.fires[0].firedWallet).toBe("A");
    expect(book.fires[0].replacementWallet).toBeNull();
    expect(book.copying).toBeNull();
    expect(book.copies.map((fill) => fill.coin)).toEqual(["PEPE"]);
  });

  it("replaces a fired wallet with a different wallet that has a better verified result", () => {
    const book = runCopyBook(
      [
        close("A", "2026-10-01T12:00:00.000Z", 40),
        close("B", "2026-10-01T12:30:00.000Z", 50),
        close("A", "2026-10-01T13:00:00.000Z", -5),
        close("A", "2026-10-01T14:00:00.000Z", -5),
        close("A", "2026-10-01T15:00:00.000Z", -5),
        close("A", "2026-10-01T17:00:00.000Z", 500),
      ],
      [
        buy("A", "2026-10-01T12:10:00.000Z", "PEPE", { amountUsd: 20, entryMarketCapUsd: 30_000 }),
        buy("A", "2026-10-01T12:20:00.000Z"),
        buy("B", "2026-10-01T12:40:00.000Z", "EARLY"),
        buy("B", "2026-10-01T15:10:00.000Z", "NEXT"),
        buy("A", "2026-10-01T16:00:00.000Z", "LATE"),
      ],
    );

    expect(book.fires).toHaveLength(1);
    const fire = book.fires[0];
    expect(fire.firedWallet).toBe("A");
    expect(fire.losses).toBe(3);
    expect(fire.replacementWallet).toBe("B");
    expect(fire.replacementWallet).not.toBe(fire.firedWallet);
    expect(fire.firedRealizedUsd).toBe(25);
    expect(fire.replacementRealizedUsd).toBe(50);
    expect(fire.replacementRealizedUsd).toBeGreaterThan(fire.firedRealizedUsd);
    expect(book.switches[0]).toMatchObject({
      fromWallet: "A",
      toWallet: "B",
      trigger: "losses",
      streak: 3,
      lossCoins: ["COIN", "COIN", "COIN"],
    });
    expect(book.switches[0].buyCaps).toEqual([{ coin: "PEPE", marketCapUsd: 30_000 }]);
    expect(book.copying).toBe("B");
    expect(book.copying).not.toBe("A");
    expect(book.lossesTowardFire).toBe(0);
    expect(book.copies.map((fill) => fill.coin)).toEqual(["PEPE", "NEXT"]);
    expect(book.copies[0]).toMatchObject({ amountUsd: 20, entryMarketCapUsd: 30_000 });
    expect(book.skippedUnnamedBuys).toBe(1);

    const scores: WalletScore[] = [walletResult("A", [close("A", "2026-10-01T12:00:00.000Z", 25)]), walletResult("B", [close("B", "2026-10-01T12:00:00.000Z", 50)])];
    expect(pickReplacement("A", 25, scores, new Set(["A"]))?.wallet).toBe("B");
    expect(pickReplacement("A", 25, scores, new Set(["A", "B"]))).toBeNull();
  });

  it("does not copy a wallet with no verified trades", () => {
    expect(eligibleWallets([])).toEqual([]);
    const book = runCopyBook([], [buy("C", "2026-10-01T12:00:00.000Z", "GHOST")]);
    expect(book.copying).toBeNull();
    expect(book.copies).toEqual([]);
    expect(book.fires).toEqual([]);
    expect(walletResult("C", []).closed).toBe(0);
    expect(walletResult("C", []).profitable).toBe(false);
  });

  it("does not copy an unprofitable wallet", () => {
    const trades = [close("D", "2026-10-01T12:00:00.000Z", -12), close("D", "2026-10-01T13:00:00.000Z", -4)];
    expect(walletResult("D", trades).profitable).toBe(false);
    expect(eligibleWallets(trades)).toEqual([]);
    const book = runCopyBook(trades, [buy("D", "2026-10-01T12:30:00.000Z", "NOPE")]);
    expect(book.copying).toBeNull();
    expect(book.copies).toEqual([]);
    expect(book.fires).toEqual([]);
    expect(book.switches).toEqual([]);
  });

  it("leaves a wallet whose verified result is no longer positive before the third loss", () => {
    const book = runCopyBook(
      [
        close("A", "2026-10-01T12:00:00.000Z", 10),
        close("B", "2026-10-01T12:10:00.000Z", 20),
        close("A", "2026-10-01T13:00:00.000Z", -6),
        close("A", "2026-10-01T14:00:00.000Z", 4),
        close("A", "2026-10-01T15:00:00.000Z", -9),
      ],
      [],
    );
    expect(book.fires).toEqual([]);
    expect(book.switches).toHaveLength(1);
    expect(book.switches[0]).toMatchObject({ fromWallet: "A", toWallet: "B", trigger: "unprofitable", losses: 2, streak: 1 });
    expect(book.copying).toBe("B");
  });
});
