import { describe, expect, it } from "vitest";
import { botPnlPoints, buildGropyPnlChart } from "@/lib/gropy/pnl";

const now = new Date("2026-10-25T16:00:00.000Z");

describe("gropy bot pnl", () => {
  it("draws a flat zero when the bot has not closed a copy", () => {
    const points = botPnlPoints([], now);
    expect(points.map((point) => point.pnl)).toEqual([0, 0]);
    const chart = buildGropyPnlChart(points);
    expect(chart?.flat).toBe(true);
    expect(chart?.end).toBe(0);
    expect(chart?.aria).toBe("Bot PnL is 0 SOL. No copy has closed.");
    expect(chart?.ticks.some((tick) => tick.label === "0")).toBe(true);
  });

  it("adds the bot's own closes and skips a close with no number", () => {
    const points = botPnlPoints(
      [
        { at: "2026-10-25T15:00:00.000Z", pnlSol: Number.NaN },
        { at: "2026-10-25T14:00:00.000Z", pnlSol: 1.2 },
        { at: "2026-10-25T15:30:00.000Z", pnlSol: -0.4 },
      ],
      now,
    );
    expect(points.map((point) => point.pnl)).toEqual([0, 1.2, 0.8]);
    const chart = buildGropyPnlChart(points);
    expect(chart?.flat).toBe(false);
    expect(chart?.end).toBe(0.8);
    expect(chart?.aria).toContain("+0.8000 SOL");
  });
});
