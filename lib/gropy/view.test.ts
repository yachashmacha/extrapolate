import { describe, expect, it } from "vitest";
import { TRACKED_KOLS } from "@/lib/kols";
import { gropyName } from "@/lib/gropy/names";
import { runCopyBook } from "@/lib/gropy/engine";
import { buildGropyView } from "@/lib/gropy/view";
import type { ClosedTrade } from "@/lib/gropy/types";

describe("gropy names", () => {
  it("shows the catalog name and leaves the address off", () => {
    for (const kol of TRACKED_KOLS) {
      const name = gropyName(kol.wallet);
      expect(name).toBeTruthy();
      expect(name).not.toContain(kol.wallet);
      expect(name).not.toContain("·");
      expect(name).not.toContain("…");
    }
  });

  it("hides a wallet that has no catalog name", () => {
    const hidden = "NotACatalogWallet1111111111111111111111";
    const trades: ClosedTrade[] = [
      {
        id: "win",
        wallet: hidden,
        closedAt: "2026-10-01T12:00:00.000Z",
        pnlUsd: 20,
        symbol: "PEPE",
      },
    ];
    const view = buildGropyView({
      catalogSize: 718,
      closed: trades,
      skippedWallets: [hidden],
      book: runCopyBook(trades, []),
      nameOf: gropyName,
      botAddress: "BotWalletOnly",
      balanceSol: 0,
      now: new Date("2026-10-25T16:00:00.000Z"),
    });
    expect(view.pnl.map((point) => point.pnl)).toEqual([0, 0]);
    expect(view.copying).toBeNull();
    expect(view.copies).toEqual([]);
    expect(view.unfunded).toBe(true);
    expect(view.skippedNames).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(hidden);
  });
});
