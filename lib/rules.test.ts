import { describe, expect, it } from "vitest";
import { dayKeyEt } from "@/lib/calendar";
import { buildRoundTrips, type MintMeta } from "@/lib/ingest/round-trips";
import type { Fill } from "@/lib/ingest/parse";
import {
  BASE_RULES,
  EXIT_RULE_TEXT,
  PACE_RULE_ID,
  PACE_RULE_TEXT,
  SIZE_RULE_TEXT,
  activePaceRule,
  activeRules,
  baseRules,
  countClosedRoundTrips,
  dayBreachSentence,
  exitedBelowStop,
  paceOverIds,
  parseRules,
  portfolioAtEntry,
  ruleBreak,
  ticketBrokeSize,
  withBaseRules,
} from "@/lib/rules";

describe("trading rules", () => {
  it("starts with the three base rules and ignores preset strings", () => {
    expect(parseRules(null)).toEqual(baseRules());
    expect(parseRules("not json")).toEqual(baseRules());
    expect(parseRules("[]")).toEqual([]);
    expect(parseRules(JSON.stringify(["Cap buys at $60k", "Preset $150"]))).toEqual([]);
    expect(baseRules().map((rule) => rule.text)).toEqual([EXIT_RULE_TEXT, SIZE_RULE_TEXT, PACE_RULE_TEXT]);
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
    expect(merged.map((rule) => rule.id)).toEqual([BASE_RULES[0].id, BASE_RULES[1].id, BASE_RULES[2].id, "own"]);
    expect(merged[2]).toMatchObject({ text: PACE_RULE_TEXT, active: true });
    expect(withBaseRules(merged)).toBe(merged);
    const hadTwo = withBaseRules([
      { id: BASE_RULES[0].id, text: EXIT_RULE_TEXT, active: true },
      { id: BASE_RULES[1].id, text: SIZE_RULE_TEXT, active: false },
      { id: "own", text: "One coin a day", active: true },
    ]);
    expect(hadTwo.map((rule) => rule.id)).toEqual([BASE_RULES[0].id, BASE_RULES[1].id, BASE_RULES[2].id, "own"]);
    expect(hadTwo[1].active).toBe(false);
    expect(hadTwo[2].active).toBe(true);
  });

  it("lists the active rules the score can read", () => {
    expect(activeRules(null).map((rule) => rule.id)).toEqual([BASE_RULES[0].id, BASE_RULES[1].id, BASE_RULES[2].id]);
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
    expect(broke.note).toMatch(/\$10 against a \$4\.50 line on a \$45 portfolio/);
    expect(broke.note).toMatch(/10 percent of your portfolio/);
    expect(dayBreachSentence([], [{ pnlUsd: 4 }])).toMatch(/including a winner/);
  });

  it("does not flag a $20 ticket on a $500 portfolio after the book gets small", () => {
    const early = "2026-10-24T15:00:00.000Z";
    const earlyExit = "2026-10-24T15:20:00.000Z";
    const later = "2026-10-24T18:00:00.000Z";
    const laterExit = "2026-10-24T18:30:00.000Z";
    const book = [
      { entryAt: early, exitAt: earlyExit, amountUsd: 20, pnlUsd: 8 },
      { entryAt: later, exitAt: laterExit, amountUsd: 40, pnlUsd: -320 },
    ];
    // 500 + 8 - 320 = 188 now. $20 is more than 10% of what's left, and 4% of the $500 at the entry.
    expect(portfolioAtEntry(early, book, 188)).toBe(500);
    expect(portfolioAtEntry(later, book, 188)).toBe(508);
    const small = ruleBreak(ruled(early, earlyExit, 20, 8), book, { accountUsd: 188 });
    expect(small.size).toBe(false);
    expect(small.note).toBe("");
    const stillInside = ruleBreak(ruled(later, laterExit, 40, -320), book, { accountUsd: 188 });
    expect(stillInside.size).toBe(false);
  });

  it("flags a $60 ticket that was over 10% of the $500 portfolio at the entry", () => {
    const entry = "2026-10-24T15:00:00.000Z";
    const exit = "2026-10-24T15:40:00.000Z";
    const book = [{ entryAt: entry, exitAt: exit, amountUsd: 60, pnlUsd: 200 }];
    expect(portfolioAtEntry(entry, book, 700)).toBe(500);
    const broke = ruleBreak(ruled(entry, exit, 60, 200), book, { accountUsd: 700 });
    expect(broke.size).toBe(true);
    expect(broke.note).toMatch(/\$60 against a \$50 line on a \$500 portfolio/);
    expect(broke.note).not.toMatch(/\$700/);
    expect(broke.note).not.toMatch(/\$70/);
  });

  it("keeps an open bag at cost when the cash alone would make a small ticket look oversized", () => {
    const before = "2026-10-24T12:00:00.000Z";
    const entry = "2026-10-24T15:00:00.000Z";
    const exit = "2026-10-24T15:20:00.000Z";
    const opens = [{ entryAt: before, costUsd: 480 }];
    const book = [{ entryAt: entry, exitAt: exit, amountUsd: 20, pnlUsd: -2 }];
    // Cash is $18 after the loss. The open bag is still at its $480 cost, so the entry portfolio was $500.
    expect(portfolioAtEntry(entry, book, 18, { cashUsd: 18, opens })).toBe(500);
    const small = ruleBreak(ruled(entry, exit, 20, -2), book, { accountUsd: 18, cashUsd: 18, opens });
    expect(small.size).toBe(false);
    const wideBook = [{ entryAt: entry, exitAt: exit, amountUsd: 60, pnlUsd: -2 }];
    const big = ruleBreak(ruled(entry, exit, 60, -2), wideBook, { accountUsd: 18, cashUsd: 18, opens });
    expect(big.size).toBe(true);
    expect(big.note).toMatch(/\$60 against a \$50 line on a \$500 portfolio/);
    expect(big.note).not.toMatch(/\$18/);
  });

  it("counts a buy and its sell as one closed trade and leaves an open position out", () => {
    const meta = new Map<string, MintMeta>([
      ["MintA", { symbol: "AAA", name: "Aaa", supply: 1_000_000, liquidityUsd: 10_000 }],
      ["MintB", { symbol: "BBB", name: "Bbb", supply: 1_000_000, liquidityUsd: 10_000 }],
    ]);
    const built = buildRoundTrips(
      [
        fill("MintA", "1", "16:00", "buy", 100, 40),
        fill("MintA", "2", "16:01", "buy", 100, 30),
        fill("MintA", "3", "16:10", "sell", 200, 80),
        fill("MintB", "4", "16:20", "buy", 80, 20),
        fill("MintB", "5", "16:30", "sell", 40, 12),
      ],
      meta,
      "wallet",
    );
    expect(built.trades).toHaveLength(1);
    expect(built.trades[0].buys).toBe(2);
    expect(built.trades[0].sells).toBe(1);
    expect(built.opens).toHaveLength(1);
    expect(countClosedRoundTrips(built.trades, "2026-10-24")).toBe(1);
    expect(countClosedRoundTrips(built.trades, "2026-10-23")).toBe(0);
  });

  it("does not count a UTC close that is still the previous evening in New York", () => {
    const evening = "2026-10-24T03:30:00.000Z";
    expect(dayKeyEt(evening)).toBe("2026-10-23");
    expect(countClosedRoundTrips([{ exitAt: evening }], "2026-10-24")).toBe(0);
    expect(countClosedRoundTrips([{ exitAt: evening }], "2026-10-23")).toBe(1);
    const midnight = "2026-10-24T04:00:00.000Z";
    expect(dayKeyEt(midnight)).toBe("2026-10-24");
    expect(countClosedRoundTrips([{ exitAt: midnight }], "2026-10-24")).toBe(1);
  });

  it("calls 51 closed trades a break and leaves 50 inside the rule", () => {
    const exits = Array.from({ length: 51 }, (_, index) => ({
      id: `t-${index}`,
      exitAt: new Date(Date.UTC(2026, 9, 24, 16, index, 0)).toISOString(),
    }));
    expect(countClosedRoundTrips(exits.slice(0, 50), "2026-10-24")).toBe(50);
    expect(paceOverIds(exits.slice(0, 50), 50)).toEqual([]);
    expect(dayBreachSentence([], [], null, 50)).toBe("");
    expect(paceOverIds(exits, 50)).toEqual(["t-50"]);
    const sentence = dayBreachSentence([], [], null, 51);
    expect(sentence).toMatch(/51 closed trades/);
    expect(sentence).toMatch(/The rule is 50/);
    expect(sentence).toContain(PACE_RULE_TEXT);
    const crowded = dayBreachSentence([], [], null, 62);
    expect(crowded).toMatch(/62 closed trades/);
    expect(crowded).toMatch(/The rule is 50/);
    const off = baseRules().map((rule) => (rule.id === PACE_RULE_ID ? { ...rule, active: false } : rule));
    expect(activePaceRule(off)).toBeNull();
    expect(dayBreachSentence([], [], off, 62)).toBe("");
  });

  it("walks a later close back when one timestamp has no milliseconds", () => {
    const book = [
      { entryAt: "2026-10-24T16:00:00Z", exitAt: "2026-10-24T16:00:00.500Z", amountUsd: 20, pnlUsd: -400 },
    ];
    expect(portfolioAtEntry("2026-10-24T16:00:00Z", book, 100)).toBe(500);
    const kept = ruleBreak(ruled("2026-10-24T16:00:00Z", "2026-10-24T16:00:00.500Z", 20, -400), book, { accountUsd: 100 });
    expect(kept.size).toBe(false);
    expect(kept.note).not.toMatch(/\$100 portfolio/);
  });
});

function fill(mint: string, signature: string, clock: string, side: "buy" | "sell", tokenAmount: number, usd: number): Fill {
  return {
    signature,
    at: `2026-10-24T${clock}:00.000Z`,
    mint,
    side,
    tokenAmount,
    usd,
  };
}

function ruled(entryAt: string, exitAt: string, amountUsd: number, pnlUsd: number) {
  return {
    id: entryAt,
    symbol: "COIN",
    entryAt,
    exitAt,
    entryMarketCapUsd: 40_000,
    exitMarketCapUsd: 30_000,
    pnlPct: amountUsd > 0 ? (pnlUsd / amountUsd) * 100 : 0,
    pnlUsd,
    amountUsd,
  };
}
