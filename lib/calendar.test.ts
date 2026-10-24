import { describe, expect, it } from "vitest";
import { dailyPnl, dayKeyEt, monthGrid, weekdayEt } from "@/lib/calendar";

describe("eastern calendar", () => {
  it("keeps late evening exits on the eastern date", () => {
    expect(dayKeyEt("2026-10-24T01:14:45.000Z")).toBe("2026-10-23");
    expect(dayKeyEt("2026-10-24T21:59:06.000Z")).toBe("2026-10-24");
  });

  it("opens October 2026 on Thursday", () => {
    expect(weekdayEt("2026-10-01")).toBe(4);
    const cells = monthGrid("2026-10");
    expect(cells[0].dayKey).toBeNull();
    expect(cells[4]).toEqual({ dayKey: "2026-10-01", day: 1 });
    expect(cells.filter((cell) => cell.day !== null)).toHaveLength(31);
    expect(cells.length % 7).toBe(0);
  });

  it("sums realized pnl on the exit day", () => {
    const days = dailyPnl([
      { exitAt: "2026-10-24T01:14:45.000Z", pnlUsd: -149 },
      { exitAt: "2026-10-24T02:07:00.000Z", pnlUsd: -58 },
      { exitAt: "2026-10-24T21:59:06.000Z", pnlUsd: 12 },
    ]);
    expect(days).toEqual([
      { dayKey: "2026-10-23", pnlUsd: -207, trades: 2, wins: 0, losses: 2 },
      { dayKey: "2026-10-24", pnlUsd: 12, trades: 1, wins: 1, losses: 0 },
    ]);
  });
});
