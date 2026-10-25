import { describe, expect, it } from "vitest";
import { isDailyReportTabVisible } from "@/lib/daily-report-tab";

describe("daily report tab", () => {
  it("hides at 6:59 PM ET and shows at 7:00 PM ET", () => {
    // EST. These instants are 23:59 and 00:00 UTC, so a UTC check would invert them.
    expect(isDailyReportTabVisible(new Date("2026-01-15T23:59:00.000Z"))).toBe(false);
    expect(isDailyReportTabVisible(new Date("2026-01-16T00:00:00.000Z"))).toBe(true);
    // EDT.
    expect(isDailyReportTabVisible(new Date("2026-07-15T22:59:00.000Z"))).toBe(false);
    expect(isDailyReportTabVisible(new Date("2026-07-15T23:00:00.000Z"))).toBe(true);
  });

  it("stays visible after 7:00 PM ET and hides at midnight ET", () => {
    expect(isDailyReportTabVisible(new Date("2026-01-16T00:30:00.000Z"))).toBe(true);
    expect(isDailyReportTabVisible(new Date("2026-01-16T04:59:00.000Z"))).toBe(true);
    expect(isDailyReportTabVisible(new Date("2026-01-16T05:00:00.000Z"))).toBe(false);
  });
});
