import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis/engine";
import { practiceTips } from "@/lib/analysis/tips";
import { sampleBook } from "@/lib/ingest/demo";
import { kolFromSpec } from "@/lib/kols";
import type { AnnotatedTrade } from "@/lib/types";

describe("practice tips", () => {
  it("writes one tip per losing trade and names that trade", () => {
    const analysis = analyze(sampleBook("axiom").trades, "axiom");
    const tips = practiceTips(analysis.trades);
    const losses = analysis.trades.filter((trade) => trade.result === "loss");
    expect(tips).toHaveLength(losses.length);
    expect(tips.every((tip) => tip.tip.includes(tip.symbol))).toBe(true);
    expect(tips.some((tip) => tip.pnlUsd >= 0)).toBe(false);
    const roar = tips.find((tip) => tip.symbol === "ROAR");
    expect(roar?.tip).toMatch(/\$480k/);
    expect(roar?.tip).toMatch(/bought at/i);
  });

  it("tells a high-cap loss to wait for the KOL the winners had", () => {
    const tips = practiceTips([
      winner("a"),
      winner("b"),
      winner("c"),
      loss("roar"),
    ]);
    expect(tips).toHaveLength(1);
    expect(tips[0].symbol).toBe("ROAR");
    expect(tips[0].tip).toMatch(/Orangie/);
    expect(tips[0].tip).toMatch(/\$480k/);
    expect(tips[0].tip).toMatch(/\$150/);
    expect(tips[0].tip).toMatch(/Pass once the coin clears/i);
  });
});

function winner(id: string): AnnotatedTrade {
  return row({
    id,
    symbol: id.toUpperCase(),
    entryMarketCapUsd: 40_000,
    amountUsd: 150,
    pnlUsd: 40,
    pnlPct: 27,
    result: "win",
    kols: [kolFromSpec("orangie:before")],
  });
}

function loss(id: string): AnnotatedTrade {
  return row({
    id,
    symbol: id.toUpperCase(),
    entryMarketCapUsd: 480_000,
    amountUsd: 480,
    pnlUsd: -278,
    pnlPct: -58,
    result: "loss",
    kols: [],
  });
}

function row(patch: Partial<AnnotatedTrade> & Pick<AnnotatedTrade, "id" | "symbol">): AnnotatedTrade {
  return {
    mint: `sample:${patch.id}`,
    name: patch.symbol,
    metas: ["animal"],
    terminal: "axiom",
    entryAt: "2026-10-02T15:00:00.000Z",
    exitAt: "2026-10-02T16:00:00.000Z",
    entryMarketCapUsd: 40_000,
    exitMarketCapUsd: 40_000,
    liquidityUsd: 40_000,
    amountUsd: 150,
    pnlUsd: 20,
    pnlPct: 10,
    holdMinutes: 20,
    kols: [],
    minutesFromLaunch: 30,
    buys: 1,
    sells: 1,
    result: "win",
    tags: [],
    note: "",
    session: "Midday",
    revenge: false,
    ...patch,
  };
}
