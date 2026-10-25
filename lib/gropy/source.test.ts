import { describe, expect, it } from "vitest";
import { TRACKED_KOLS } from "@/lib/kols";
import { buysFromKolScan, closedFromUnknown, loadGropySource } from "@/lib/gropy/source";
import { gropyName } from "@/lib/gropy/names";
import { runCopyBook } from "@/lib/gropy/engine";
import { buildGropyView } from "@/lib/gropy/view";

describe("gropy source", () => {
  it("keeps a buy time and drops a miss, without inventing a result", () => {
    const buys = buysFromKolScan({
      "wallet|mint": 1_792_878_983,
      "wallet|miss": 0,
      bad: 10,
    });
    expect(buys).toHaveLength(1);
    expect(buys[0]).toMatchObject({ wallet: "wallet", mint: "mint" });
    expect(buys[0]).not.toHaveProperty("pnlUsd");
    expect(buys[0].symbol).toBeUndefined();
    expect(buys[0].amountUsd).toBeUndefined();
  });

  it("drops a close that has no numeric result", () => {
    const closed = closedFromUnknown([
      { wallet: "wallet", closedAt: "2026-10-01T00:00:00.000Z", pnlUsd: "12" },
      { wallet: "wallet", closedAt: "not-a-time", pnlUsd: 12 },
      { wallet: "wallet", closedAt: "2026-10-01T00:00:00.000Z", pnlUsd: 12, symbol: "PEPE" },
    ]);
    expect(closed).toHaveLength(1);
    expect(closed[0].pnlUsd).toBe(12);
    expect(closed[0].symbol).toBe("PEPE");
  });

  it("does not score a catalog wallet from a buy time alone", () => {
    const wallet = TRACKED_KOLS[0].wallet;
    const source = loadGropySource(
      () => ({ [`${wallet}|So11111111111111111111111111111111111111112`]: 1_792_878_983, [`${wallet}|other`]: 0 }),
      () => [{ wallet: "not-a-kol", closedAt: "2026-10-01T00:00:00.000Z", pnlUsd: 40, symbol: "NO" }],
    );
    expect(source.catalogSize).toBe(718);
    expect(source.closed).toEqual([]);
    expect(source.buys).toHaveLength(1);
    expect(source.buyOnlyWallets).toEqual([wallet]);

    const view = buildGropyView({
      catalogSize: source.catalogSize,
      closed: source.closed,
      buyOnlyWallets: source.buyOnlyWallets,
      book: runCopyBook(source.closed, source.buys),
      nameOf: gropyName,
    });
    expect(view.copying).toBeNull();
    expect(view.copies).toEqual([]);
    expect(view.eligibleCount).toBe(0);
    expect(view.unscoredNames).toEqual([gropyName(wallet)]);
    const printed = JSON.stringify(view);
    expect(printed).not.toContain(wallet);
    expect(printed).not.toContain("·");
    expect(printed).not.toContain("…");
  });
});
