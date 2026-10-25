import { describe, expect, it } from "vitest";
import { fomoStatus } from "@/lib/analysis/fomo";
import { revengeIds } from "@/lib/analysis/slices";
import type { RoundTrip } from "@/lib/types";

describe("revenge after the close that just happened", () => {
  it("flags the next ticket after a small red close even when another coin was open", () => {
    const trades = [
      ...Array.from({ length: 6 }, (_, index) => trip(`base-${index}`, `2026-10-24T12:0${index}:00.000Z`, 20, 2)),
      trip("loss", "2026-10-24T14:00:00.000Z", 20, -8, "2026-10-24T14:10:00.000Z"),
      trip("overlap", "2026-10-24T14:05:00.000Z", 20, 4, "2026-10-24T14:08:00.000Z"),
      trip("chase", "2026-10-24T14:12:00.000Z", 40, -15, "2026-10-24T14:20:00.000Z"),
    ];
    const revenge = revengeIds(trades);
    expect(revenge.has("chase")).toBe(true);
    expect(revenge.has("overlap")).toBe(false);
  });

  it("does not call a size-up after an already large loss revenge", () => {
    const trades = [
      ...Array.from({ length: 6 }, (_, index) => trip(`base-${index}`, `2026-10-24T12:0${index}:00.000Z`, 20, 2)),
      trip("huge", "2026-10-24T15:00:00.000Z", 80, -40, "2026-10-24T15:05:00.000Z"),
      trip("chase", "2026-10-24T15:10:00.000Z", 200, -20, "2026-10-24T15:12:00.000Z"),
    ];
    expect(revengeIds(trades).has("chase")).toBe(false);
  });
});

describe("fomo needs both drops", () => {
  it("does not label FOMO when volume fell and market cap did not", () => {
    expect(fomoStatus({ volumeDroppedAfter: true, mcDroppedAfter: false })).toBe("no");
    expect(fomoStatus({ volumeDroppedAfter: false, mcDroppedAfter: true })).toBe("no");
    expect(fomoStatus({ volumeDroppedAfter: true })).toBe("unknown");
  });
});

function trip(id: string, entryAt: string, amountUsd: number, pnlUsd: number, exitAt?: string): RoundTrip {
  const entry = Date.parse(entryAt);
  return {
    id,
    mint: id,
    symbol: id.toUpperCase(),
    name: id,
    metas: ["other"],
    terminal: "wallet",
    entryAt,
    exitAt: exitAt ?? new Date(entry + 30_000).toISOString(),
    entryMarketCapUsd: 20_000,
    exitMarketCapUsd: 20_000,
    liquidityUsd: 0,
    amountUsd,
    pnlUsd,
    pnlPct: amountUsd > 0 ? (pnlUsd / amountUsd) * 100 : 0,
    holdMinutes: 1,
    kols: [],
    minutesFromLaunch: -1,
    buys: 1,
    sells: 1,
  };
}
