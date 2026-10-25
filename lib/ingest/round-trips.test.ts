import { describe, expect, it } from "vitest";
import { buildRoundTrips } from "@/lib/ingest/round-trips";
import type { Fill } from "@/lib/ingest/parse";
import type { MintMeta } from "@/lib/ingest/round-trips";

const meta = new Map<string, MintMeta>([
  ["Mintpump", { symbol: "DOWN", name: "Down", supply: 1_000_000, liquidityUsd: 10_000 }],
]);

describe("round trips", () => {
  it("marks a later buy under the average as averaging down", () => {
    const { trades } = buildRoundTrips(
      [
        fill("a", "16:00", "buy", 100, 50),
        fill("b", "16:01", "buy", 100, 30),
        fill("c", "16:02", "sell", 200, 40),
      ],
      meta,
      "wallet",
    );
    expect(trades).toHaveLength(1);
    expect(trades[0].averagedDown).toBe(true);
    expect(trades[0].buys).toBe(2);
  });

  it("does not mark a second buy that is higher than the average", () => {
    const { trades } = buildRoundTrips(
      [
        fill("a", "16:00", "buy", 100, 50),
        fill("b", "16:01", "buy", 100, 80),
        fill("c", "16:02", "sell", 200, 90),
      ],
      meta,
      "wallet",
    );
    expect(trades[0].averagedDown).toBe(false);
    expect(trades[0].buys).toBe(2);
  });

  it("keeps a winning sell a win after a lower add, and prices the cap from supply", () => {
    const { trades } = buildRoundTrips(
      [
        fill("a", "16:00", "buy", 100, 50),
        fill("b", "16:01", "buy", 100, 30),
        fill("c", "16:02", "sell", 200, 120),
      ],
      meta,
      "wallet",
    );
    expect(trades[0].averagedDown).toBe(true);
    expect(trades[0].pnlUsd).toBe(40);
    expect(trades[0].pnlUsd).toBeGreaterThan(0);
    // Price 0.40 times supply 1,000,000. Not price times the $10,000 pool.
    expect(trades[0].entryMarketCapUsd).toBe(400_000);
    expect(trades[0].entryMarketCapUsd).not.toBe(4_000);
  });
});

function fill(signature: string, clock: string, side: "buy" | "sell", tokenAmount: number, usd: number): Fill {
  return {
    signature,
    at: `2026-10-24T${clock}:00.000Z`,
    mint: "Mintpump",
    side,
    tokenAmount,
    usd,
  };
}
