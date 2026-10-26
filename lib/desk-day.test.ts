import { describe, expect, it } from "vitest";
import { tradingHabits } from "@/lib/analysis/habits";
import { analysingLabel, deskTradesForDay, isSelectableDeskDay, selectableDeskDays, todayKeyEt } from "@/lib/desk-day";
import type { RoundTrip } from "@/lib/types";

const NOON_ET_OCT_26 = new Date("2026-10-26T16:00:00.000Z");

describe("desk day selection", () => {
  it("reads today as Today and a past day by its date", () => {
    expect(todayKeyEt(NOON_ET_OCT_26)).toBe("2026-10-26");
    expect(analysingLabel("2026-10-26", NOON_ET_OCT_26)).toBe("analysing: Today");
    expect(analysingLabel("2026-10-24", NOON_ET_OCT_26)).toBe("analysing: Oct 24");
    expect(analysingLabel("2026-10-26", NOON_ET_OCT_26)).not.toMatch(/Oct|analyzing/i);
  });

  it("keeps late evening Eastern time on that calendar day", () => {
    const late = new Date("2026-10-26T03:30:00.000Z");
    expect(todayKeyEt(late)).toBe("2026-10-25");
    expect(analysingLabel("2026-10-25", late)).toBe("analysing: Today");
    expect(analysingLabel("2026-10-24", late)).toBe("analysing: Oct 24");
    expect(selectableDeskDays(late)).not.toContain("2026-10-26");
  });

  it("offers this month through today and leaves future days out", () => {
    const days = selectableDeskDays(NOON_ET_OCT_26);
    expect(days[0]).toBe("2026-10-26");
    expect(days.at(-1)).toBe("2026-10-01");
    expect(days).toHaveLength(26);
    expect(days).not.toContain("2026-10-27");
    expect(days).not.toContain("2026-09-30");
    expect(isSelectableDeskDay("2026-10-24", NOON_ET_OCT_26)).toBe(true);
    expect(isSelectableDeskDay("2026-10-27", NOON_ET_OCT_26)).toBe(false);
    expect(isSelectableDeskDay("2026-11-01", NOON_ET_OCT_26)).toBe(false);
  });
});

describe("desk trades for an Eastern day", () => {
  const prior = trade("prior", "2026-10-23T18:00:00.000Z", "2026-10-23T20:00:00.000Z");
  const heldOvernight = trade("held", "2026-10-23T22:00:00.000Z", "2026-10-24T16:00:00.000Z");
  const oct24Late = trade("late", "2026-10-25T02:00:00.000Z", "2026-10-25T03:59:00.000Z");
  const oct25 = trade("next", "2026-10-25T04:30:00.000Z", "2026-10-25T18:00:00.000Z");
  const today = trade("today", "2026-10-26T15:00:00.000Z", "2026-10-26T18:00:00.000Z");
  const future = trade("future", "2026-10-27T15:00:00.000Z", "2026-10-27T18:00:00.000Z");
  const book = [prior, heldOvernight, oct24Late, oct25, today, future];

  it("keeps today and a past day on the exit, and drops a future day", () => {
    expect(deskTradesForDay(book, "2026-10-26", NOON_ET_OCT_26).map((row) => row.id)).toEqual(["today"]);
    expect(deskTradesForDay(book, "2026-10-24", NOON_ET_OCT_26).map((row) => row.id)).toEqual(["held", "late"]);
    expect(deskTradesForDay(book, "2026-10-23", NOON_ET_OCT_26).map((row) => row.id)).toEqual(["prior"]);
    expect(deskTradesForDay(book, "2026-10-25", NOON_ET_OCT_26).map((row) => row.id)).toEqual(["next"]);
    expect(deskTradesForDay(book, "2026-10-27", NOON_ET_OCT_26)).toEqual([]);
    expect(deskTradesForDay(book, "2026-10-26", NOON_ET_OCT_26).map((row) => row.id)).not.toContain("future");
  });

  it("still sees a break-even chase whose red close was an earlier day", () => {
    const first = closed("red-1", "mint-again", "AGAIN", "2026-10-23T18:00:00.000Z", "2026-10-23T19:00:00.000Z", -20);
    const againA = closed("again-a", "mint-again", "AGAIN", "2026-10-24T16:00:00.000Z", "2026-10-24T17:00:00.000Z", -15);
    const againB = closed("again-b", "mint-again", "AGAIN", "2026-10-24T18:00:00.000Z", "2026-10-24T19:00:00.000Z", -12);
    const history = [first, againA, againB];
    const day = deskTradesForDay(history, "2026-10-24", NOON_ET_OCT_26);
    expect(day.map((row) => row.id)).toEqual(["again-a", "again-b"]);
    const withHistory = tradingHabits(day, undefined, history).negative.find((habit) => habit.id === "reentry");
    const dayOnly = tradingHabits(day).negative.find((habit) => habit.id === "reentry");
    expect(withHistory?.title).toBe("Break-even chase");
    expect(withHistory?.tradeIds).toEqual(["again-a", "again-b"]);
    expect(withHistory?.detail).toMatch(/already closed red/);
    expect(dayOnly).toBeUndefined();
  });
});

function trade(id: string, entryAt: string, exitAt: string): { id: string; entryAt: string; exitAt: string } {
  return { id, entryAt, exitAt };
}

function closed(id: string, mint: string, symbol: string, entryAt: string, exitAt: string, pnlUsd: number): RoundTrip {
  return {
    id,
    mint,
    symbol,
    name: symbol,
    metas: ["other"],
    terminal: "wallet",
    entryAt,
    exitAt,
    entryMarketCapUsd: 40_000,
    exitMarketCapUsd: 30_000,
    liquidityUsd: 100_000,
    amountUsd: 20,
    pnlUsd,
    pnlPct: (pnlUsd / 20) * 100,
    holdMinutes: 60,
    kols: [],
    minutesFromLaunch: -1,
    buys: 1,
    sells: 1,
  };
}
