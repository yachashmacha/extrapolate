import { describe, expect, it } from "vitest";
import {
  BASE_RULES,
  EXIT_RULE_TEXT,
  SIZE_RULE_TEXT,
  activeRules,
  baseRules,
  dayBreachSentence,
  exitedBelowStop,
  parseRules,
  portfolioAtEntry,
  ruleBreak,
  ticketBrokeSize,
  withBaseRules,
} from "@/lib/rules";

describe("trading rules", () => {
  it("starts with the two base rules and ignores preset strings", () => {
    expect(parseRules(null)).toEqual(baseRules());
    expect(parseRules("not json")).toEqual(baseRules());
    expect(parseRules("[]")).toEqual([]);
    expect(parseRules(JSON.stringify(["Cap buys at $60k", "Preset $150"]))).toEqual([]);
    expect(baseRules().map((rule) => rule.text)).toEqual([EXIT_RULE_TEXT, SIZE_RULE_TEXT]);
    expect(baseRules().every((rule) => rule.active)).toBe(true);
  });

  it("keeps rules the trader wrote", () => {
    expect(
      parseRules(JSON.stringify([{ id: "r1", text: "  Next buy after red is $10  ", active: true }, { id: "r2", text: "One ticket per coin", active: false }])),
    ).toEqual([
      { id: "r1", text: "Next buy after red is $10", active: true },
      { id: "r2", text: "One ticket per coin", active: false },
    ]);
  });

  it("adds the base rules in front of a saved list and leaves a complete list alone", () => {
    const merged = withBaseRules([{ id: "own", text: "One coin a day", active: true }]);
    expect(merged.map((rule) => rule.id)).toEqual([BASE_RULES[0].id, BASE_RULES[1].id, "own"]);
    expect(withBaseRules(merged)).toBe(merged);
  });

  it("lists the active rules the score can read", () => {
    expect(activeRules(null).map((rule) => rule.id)).toEqual([BASE_RULES[0].id, BASE_RULES[1].id]);
    expect(activeRules([{ id: BASE_RULES[0].id, text: EXIT_RULE_TEXT, active: false }])).toEqual([]);
  });

  it("calls an exit below half a broken stop and an exit above half a kept one", () => {
    expect(exitedBelowStop({ entryMarketCapUsd: 40_000, exitMarketCapUsd: 19_000, pnlPct: -52 }, 0.5)).toBe(true);
    expect(exitedBelowStop({ entryMarketCapUsd: 40_000, exitMarketCapUsd: 20_000, pnlPct: -50 }, 0.5)).toBe(false);
    expect(exitedBelowStop({ entryMarketCapUsd: 40_000, exitMarketCapUsd: 21_000, pnlPct: -80 }, 0.5)).toBe(false);
    expect(exitedBelowStop({ entryMarketCapUsd: 0, exitMarketCapUsd: 0, pnlPct: -60 }, 0.5)).toBe(true);
    expect(exitedBelowStop({ entryMarketCapUsd: 0, exitMarketCapUsd: 0, pnlPct: -40 }, 0.5)).toBe(false);
  });

  it("flags a ticket bigger than 10% of the portfolio at the entry, including a winner", () => {
    const book = [
      { exitAt: "2026-10-24T18:00:00.000Z", pnlUsd: -20 },
      { exitAt: "2026-10-24T20:00:00.000Z", pnlUsd: 5 },
    ];
    expect(portfolioAtEntry("2026-10-24T16:00:00.000Z", book, 30)).toBe(45);
    expect(ticketBrokeSize(10, 45, 0.1)).toBe(true);
    expect(ticketBrokeSize(4.5, 45, 0.1)).toBe(false);
    const broke = ruleBreak(
      {
        id: "win",
        symbol: "UP",
        entryAt: "2026-10-24T16:00:00.000Z",
        exitAt: "2026-10-24T18:00:00.000Z",
        entryMarketCapUsd: 40_000,
        exitMarketCapUsd: 50_000,
        pnlPct: 20,
        pnlUsd: 4,
        amountUsd: 10,
      },
      book,
      { accountUsd: 30 },
    );
    expect(broke.size).toBe(true);
    expect(broke.stop).toBe(false);
    expect(broke.note).toMatch(/more than 10%/);
    expect(broke.note).toMatch(/10 percent of your portfolio/);
    expect(dayBreachSentence([], [{ pnlUsd: 4 }])).toMatch(/including a winner/);
  });
});
