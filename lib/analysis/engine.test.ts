import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis/engine";
import { hourEt } from "@/lib/format";
import { median } from "@/lib/analysis/stats";
import { sampleBook } from "@/lib/ingest/demo";
import { kolFromSpec } from "@/lib/kols";
import type { RoundTrip, TerminalId } from "@/lib/types";

describe("sample book", () => {
  const book = sampleBook("axiom");
  const analysis = analyze(book.trades, "axiom");

  it("separates winners from losers on market cap and size", () => {
    expect(analysis.summary.trades).toBeGreaterThan(30);
    expect(analysis.summary.netPnlUsd).toBeLessThan(0);
    expect(analysis.summary.grossProfitUsd).toBeGreaterThan(1000);
    expect(analysis.lede).toContain("−$");
    expect(analysis.fixes.find((fix) => fix.category === "entry")?.evidence).toContain("−$");
    expect(analysis.comparison.winners.medianEntryMc).toBeLessThan(80_000);
    expect(analysis.comparison.losers.medianEntryMc).toBeGreaterThan(150_000);
    expect(analysis.comparison.losers.medianSize).toBeGreaterThan(analysis.comparison.winners.medianSize * 1.5);
  });

  it("writes a practical fix in every category the trader asked about", () => {
    const categories = analysis.fixes.map((fix) => fix.category);
    expect(categories).toContain("entry");
    expect(categories).toContain("size");
    expect(categories).toContain("callers");
    expect(categories).toContain("narrative");
    expect(categories).toContain("behavior");
    for (const fix of analysis.fixes) {
      expect(fix.rule.length).toBeGreaterThan(20);
      expect(fix.steps.length).toBeGreaterThan(0);
      expect(fix.sample).toBeGreaterThanOrEqual(3);
      expect(fix.evidence).toMatch(/\d/);
    }
  });

  it("keeps the habits that actually paid", () => {
    expect(analysis.keeps.some((keep) => keep.category === "narrative" && /animal/i.test(keep.title))).toBe(true);
    expect(analysis.keeps.some((keep) => keep.category === "entry")).toBe(true);
    expect(analysis.checklist.length).toBeGreaterThanOrEqual(4);
  });

  it("puts Orangie on the green side and the empty KOL row on the red side", () => {
    const orangie = analysis.kols.find((kol) => kol.id === "orangie");
    const none = analysis.kols.find((kol) => kol.id === "none");
    expect(orangie?.winRate).toBeGreaterThan(0.6);
    expect(none && none.netPnlUsd).toBeLessThan(0);
  });

  it("explains a losing trade against the winners in its narrative", () => {
    const roar = analysis.trades.find((trade) => trade.symbol === "ROAR");
    expect(roar?.result).toBe("loss");
    expect(roar?.note).toMatch(/Winners in animals/i);
    expect(roar?.note).toMatch(/\$480,000/);
  });
});

describe("thin books", () => {
  it("refuses to prescribe from a handful of trades", () => {
    const analysis = analyze([trade("a", 10, 100, 20), trade("b", 11, 400, -30)], "photon");
    expect(analysis.thin).toBe(true);
    expect(analysis.fixes).toEqual([]);
    expect(analysis.checklist).toEqual([]);
  });
});

describe("clock", () => {
  it("reads hours in Eastern time", () => {
    expect(hourEt("2026-10-01T14:12:00Z")).toBe(10);
    expect(hourEt("2026-10-02T04:35:00Z")).toBe(0);
  });
});

describe("median", () => {
  it("averages the two middle values", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([4, 1, 9])).toBe(4);
  });
});

function trade(id: string, hour: number, mc: number, pct: number, amount = 100): RoundTrip {
  const entry = new Date(Date.UTC(2026, 9, 1, hour + 4, 0)).toISOString();
  return {
    id,
    mint: `sample:${id}`,
    symbol: id.toUpperCase(),
    name: id,
    metas: ["other"],
    terminal: "axiom" as TerminalId,
    entryAt: entry,
    exitAt: new Date(Date.parse(entry) + 20 * 60_000).toISOString(),
    entryMarketCapUsd: mc,
    exitMarketCapUsd: mc,
    liquidityUsd: 40_000,
    amountUsd: amount,
    pnlUsd: (amount * pct) / 100,
    pnlPct: pct,
    holdMinutes: 20,
    kols: [kolFromSpec("orangie:before")],
    minutesFromLaunch: 30,
    buys: 1,
    sells: 1,
  };
}
