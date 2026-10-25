import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis/engine";
import { fmtUsd } from "@/lib/format";
import { sampleBook } from "@/lib/ingest/demo";
import {
  buildEquityChart,
  equityAxisTicks,
  equityDomain,
  etStamp,
  spacedTicks,
  worstEquityIndex,
} from "@/lib/equity-scale";
import type { EquityPoint } from "@/lib/types";

const series: EquityPoint[] = [
  { at: "2026-10-01T14:12:00Z", pnl: -12.4 },
  { at: "2026-10-10T18:00:00Z", pnl: -400 },
  { at: "2026-10-18T02:30:00Z", pnl: -512.4 },
  { at: "2026-10-20T21:41:00Z", pnl: -487 },
];

describe("Eastern axis stamps", () => {
  it("formats afternoon and the fall-back hour in America/New_York", () => {
    expect(etStamp("2026-10-01T14:12:00Z")).toEqual({
      date: "Oct 1",
      time: "10:12 AM",
      label: "Oct 1, 10:12 AM ET",
    });
    expect(etStamp("2026-10-18T02:30:00Z").label).toBe("Oct 17, 10:30 PM ET");
    expect(etStamp("2026-11-02T15:00:00Z").time).toBe("10:00 AM");
    expect(etStamp("2026-07-04T04:05:00Z").time).toBe("12:05 AM");
  });

  it("adds the year when the window crosses one", () => {
    expect(etStamp("2025-12-31T20:00:00Z", true).date).toBe("Dec 31, 2025");
  });
});

describe("dollar axis", () => {
  it("includes zero and the exact low", () => {
    const { min, max } = equityDomain(series.map((point) => point.pnl));
    expect(min).toBe(-512.4);
    expect(max).toBe(0);
    const ticks = equityAxisTicks(min, max);
    expect(ticks).toContain(0);
    expect(ticks).toContain(-512.4);
    for (const tick of ticks) {
      expect(tick).toBeGreaterThanOrEqual(min - 0.001);
      expect(tick).toBeLessThanOrEqual(max + 0.001);
    }
  });

  it("keeps zero and the low when the book barely moves", () => {
    expect(spacedTicks([-4, 0], (value) => -value, 100)).toEqual([-4, 0]);
  });

  it("omits a high that would sit on the zero label", () => {
    const kept = spacedTicks([-520, -400, -200, 0, 35], (value) => -value, 40);
    expect(kept).toContain(0);
    expect(kept).toContain(-520);
    expect(kept).not.toContain(35);
    expect(kept).toContain(-400);
  });

  it("drops a nice tick that would cover the low", () => {
    const yOf = (value: number) => -value;
    const kept = spacedTicks([-512.4, -500, -250, 0], yOf, 20);
    expect(kept).toContain(0);
    expect(kept).toContain(-512.4);
    expect(kept).not.toContain(-500);
    expect(kept).toContain(-250);
  });
});

describe("closed equity model", () => {
  it("labels start, end, and the first low from the series itself", () => {
    expect(worstEquityIndex(series)).toBe(2);
    const model = buildEquityChart(series);
    expect(model).not.toBeNull();
    const labels = model!.ticks.map((tick) => tick.label);
    expect(labels).toContain("$0");
    expect(labels).toContain(fmtUsd(-512.4));
    expect(labels.every((label) => label.startsWith("$") || label.startsWith("−$"))).toBe(true);

    const start = model!.marks.find((mark) => mark.roles.includes("start"));
    const end = model!.marks.find((mark) => mark.roles.includes("end"));
    const low = model!.marks.find((mark) => mark.roles.includes("low"));
    expect(start?.label).toBe(fmtUsd(series[0].pnl));
    expect(start?.stamp.label).toBe("Oct 1, 10:12 AM ET");
    expect(end?.label).toBe(fmtUsd(series[3].pnl));
    expect(end?.stamp.label).toBe("Oct 20, 5:41 PM ET");
    expect(low?.label).toBe(fmtUsd(series[2].pnl));
    expect(low?.stamp.label).toBe("Oct 17, 10:30 PM ET");
    expect(low?.roles).toEqual(["low"]);
    expect(model!.aria).toContain("Eastern time");
    expect(model!.aria).toContain(fmtUsd(-512.4));
  });

  it("folds the low into the end mark when the book finishes there", () => {
    const points: EquityPoint[] = [
      { at: "2026-10-01T14:12:00Z", pnl: 20 },
      { at: "2026-10-02T14:12:00Z", pnl: -40 },
    ];
    const model = buildEquityChart(points);
    expect(model!.marks).toHaveLength(2);
    const end = model!.marks.find((mark) => mark.roles.includes("end"));
    expect(end?.roles).toEqual(["end", "low"]);
    expect(end?.kicker).toBe("End · Low");
    expect(end?.label).toBe(fmtUsd(-40));
  });

  it("uses the sample book's equity series for the scale", () => {
    const equity = analyze(sampleBook("wallet").trades, "wallet").equity;
    const model = buildEquityChart(equity);
    const low = Math.min(...equity.map((point) => point.pnl));
    expect(model!.ticks.map((tick) => tick.label)).toContain("$0");
    expect(model!.ticks.map((tick) => tick.label)).toContain(fmtUsd(low));
    expect(model!.marks[0].label).toBe(fmtUsd(equity[0].pnl));
    expect(model!.marks.at(-1)?.label).toBe(fmtUsd(equity.at(-1)!.pnl));
    expect(model!.aria).toMatch(/ET/);
  });
});
