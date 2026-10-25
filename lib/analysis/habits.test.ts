import { describe, expect, it } from "vitest";
import { bookBounds } from "@/lib/analysis/bounds";
import { tradingHabits } from "@/lib/analysis/habits";
import { sampleBook } from "@/lib/ingest/demo";
import type { KolTag, RoundTrip } from "@/lib/types";

describe("trading habits", () => {
  it("reads the sample book as biases and tendencies, without sizing off a caller", () => {
    const { positive, negative } = tradingHabits(sampleBook().trades);
    expect(positive.length).toBeGreaterThan(0);
    expect(negative.length).toBeGreaterThan(0);
    const blob = [...positive, ...negative].map((habit) => `${habit.title} ${habit.detail}`).join("\n");
    expect(blob).not.toMatch(/as much as/i);
    expect(blob).not.toMatch(/caller's size|kol size|match the kol/i);
    expect(negative.some((habit) => /overnight|higher caps|pool|long after/i.test(habit.title))).toBe(true);
    expect(negative.some((habit) => habit.title === "FOMO" || habit.title === "Revenge trading" || habit.title === "Confirmation bias")).toBe(
      false,
    );
    expect(positive.some((habit) => /paid|daytime|smaller|flat|already in|green|young/i.test(habit.title))).toBe(true);
    expect(positive.every((habit) => habit.mark === "Tendency")).toBe(true);
    for (const habit of [...positive, ...negative]) {
      expect(habit.tradeIds.length).toBeGreaterThan(0);
      expect(habit.stat).toMatch(/trade/);
    }
  });

  it("keeps a buy near the high out of FOMO when the bond and the volume are missing", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, index) => row(`near-${index}`, index, { mc: 90_000, ath: 100_000, pnl: -40, symbol: `NEAR${index}` })),
      ...Array.from({ length: 4 }, (_, index) => row(`off-${index}`, index + 4, { mc: 30_000, ath: 100_000, pnl: 25, symbol: `OFF${index}` })),
    ];
    const { positive, negative } = tradingHabits(trades);
    const off = positive.find((habit) => habit.id === "ath-off");
    expect(negative.some((habit) => habit.title === "FOMO")).toBe(false);
    expect(off?.title).toBe("Bought well under the high");
    expect(off?.mark).toBe("Tendency");
    expect(off?.detail).toMatch(/45% of that coin's ATH/);
    expect(off?.detail).toMatch(/30% of the high/);
    expect(off?.detail).not.toMatch(/FOMO/i);
  });

  it("names FOMO only for a bond entry while volume is falling", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, index) =>
        row(`fade-${index}`, index, {
          mc: 80_000,
          ath: 90_000,
          pnl: -40,
          graduation: 43_000,
          volumeFalling: true,
          symbol: `FADE${index}`,
        }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        row(`early-${index}`, index + 4, {
          mc: 12_000,
          ath: 90_000,
          pnl: 25,
          graduation: 43_000,
          volumeFalling: true,
          symbol: `EARLY${index}`,
        }),
      ),
    ];
    const fomo = tradingHabits(trades).negative.find((habit) => habit.id === "fomo");
    expect(fomo?.title).toBe("FOMO");
    expect(fomo?.mark).toBe("Bias");
    expect(fomo?.detail).toMatch(/graduation price while volume was falling/);
    expect(fomo?.detail).not.toMatch(/75%/);
    expect(fomo?.tradeIds).toHaveLength(4);
  });

  it("does not name FOMO when the same late price still has rising volume", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, index) =>
        row(`rise-${index}`, index, { mc: 90_000, ath: 100_000, pnl: -40, graduation: 43_000, volumeFalling: false }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        row(`off-${index}`, index + 4, { mc: 20_000, ath: 100_000, pnl: 25, graduation: 43_000, volumeFalling: false }),
      ),
    ];
    const habits = tradingHabits(trades);
    expect([...habits.positive, ...habits.negative].some((habit) => habit.title === "FOMO" || habit.id === "fomo-paid")).toBe(false);
  });

  it("skips the high when the book has no ATH", () => {
    const trades = Array.from({ length: 8 }, (_, index) => row(`plain-${index}`, index, { pnl: index < 4 ? -20 : 20 }));
    const habits = tradingHabits(trades);
    expect([...habits.positive, ...habits.negative].some((habit) => habit.id.startsWith("ath"))).toBe(false);
  });

  it("keeps the ticket inside the account and the active rule after a loss", () => {
    const trades = [
      row("w1", 1, { pnl: 10, amount: 20 }),
      row("l1", 2, { pnl: -8, amount: 20 }),
      row("up1", 3, { pnl: -40, amount: 80, kol: kol("Cented", "after") }),
      row("l2", 4, { pnl: -8, amount: 20 }),
      row("up2", 5, { pnl: -40, amount: 80, kol: kol("Cented", "after") }),
      row("l3", 6, { pnl: -8, amount: 20 }),
      row("up3", 7, { pnl: -40, amount: 80, kol: kol("Cented", "after") }),
      row("w2", 8, { pnl: 10, amount: 20 }),
      row("w3", 9, { pnl: 10, amount: 20 }),
      row("flat1", 10, { pnl: 12, amount: 20 }),
    ];
    const bounds = bookBounds({
      trades,
      accountUsd: 8_000,
      rules: [
        { id: "off", text: "Next buy is $200", active: false },
        { id: "on", text: "Next buy is $10", active: true },
      ],
    });
    const sized = tradingHabits(trades, bounds).negative.find((habit) => habit.id === "size-after-loss");
    expect(sized?.title).toBe("Revenge trading");
    expect(sized?.mark).toBe("Bias");
    expect(sized?.detail).toMatch(/Loss-chasing/);
    expect(sized?.detail).toMatch(/30 minutes/);
    expect(sized?.detail).toMatch(/1\.5×/);
    expect(sized?.detail).toMatch(/stays at \$10/);
    expect(sized?.detail).toMatch(/Next buy is \$10/);
    expect(sized?.detail).not.toMatch(/\$200/);
    expect(sized?.detail).not.toMatch(/Cented/);
    expect(sized?.detail).not.toMatch(/stays at \$80/);
    expect(sized?.detail).not.toMatch(/as much as/i);
    expect(sized?.tradeIds.length).toBeGreaterThanOrEqual(3);
  });

  it("quotes a market-cap rule and ignores an inactive one", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, index) => row(`low-${index}`, index, { mc: 18_000, pnl: 20, symbol: `LOW${index}` })),
      ...Array.from({ length: 4 }, (_, index) => row(`high-${index}`, index + 4, { mc: 80_000, pnl: -30, symbol: `HIGH${index}` })),
    ];
    const bounds = bookBounds({
      trades,
      rules: [
        { id: "off", text: "Pass above $5k market cap", active: false },
        { id: "on", text: "Pass above $20k market cap", active: true },
      ],
    });
    const habit = tradingHabits(trades, bounds).negative.find((habit) => habit.id === "mc-above-rule");
    expect(habit?.detail).toMatch(/\$20k/);
    expect(habit?.detail).toMatch(/Pass above \$20k market cap/);
    expect(habit?.detail).not.toMatch(/\$5k/);
  });

  it("quotes a one-ticket rule when the book adds to losers", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, index) => row(`once-${index}`, index, { pnl: 15, buys: 1, symbol: `ONCE${index}` })),
      ...Array.from({ length: 4 }, (_, index) =>
        row(`add-${index}`, index + 4, { pnl: -25, buys: 3, averagedDown: true, symbol: `ADD${index}` }),
      ),
    ];
    const bounds = bookBounds({
      trades,
      rules: [{ id: "one", text: "One ticket per coin", active: true }],
    });
    const habit = tradingHabits(trades, bounds).negative.find((habit) => habit.id === "adds");
    expect(habit?.title).toBe("Averaging down");
    expect(habit?.mark).toBe("Bias");
    expect(habit?.detail).toMatch(/already down/);
    expect(habit?.title).not.toMatch(/sunk/i);
    expect(habit?.detail).toMatch(/One ticket per coin/);
    expect(habit?.tradeIds).toHaveLength(4);
  });

  it("names the sunk-cost fallacy only on a re-entry after a red close", () => {
    const trades = [
      row("a1", 1, { pnl: -20, symbol: "AGAIN", mint: "mint-again" }),
      row("a2", 2, { pnl: -15, symbol: "AGAIN", mint: "mint-again" }),
      row("a3", 3, { pnl: -12, symbol: "AGAIN", mint: "mint-again" }),
      row("a4", 4, { pnl: -10, symbol: "AGAIN", mint: "mint-again" }),
      row("b1", 5, { pnl: 20, symbol: "ONCE1" }),
      row("b2", 6, { pnl: 18, symbol: "ONCE2" }),
      row("b3", 7, { pnl: 16, symbol: "ONCE3" }),
    ];
    const habit = tradingHabits(trades).negative.find((item) => item.id === "reentry");
    expect(habit?.title).toBe("Sunk-cost fallacy");
    expect(habit?.mark).toBe("Fallacy");
    expect(habit?.detail).toMatch(/Trying to get back to even/);
    expect(habit?.detail).toMatch(/after a red close/);
    expect(habit?.detail).toMatch(/AGAIN/);
    expect(habit?.tradeIds).toEqual(["a2", "a3", "a4"]);
    expect(habit?.stat).toMatch(/3 trades/);
  });

  it("names confirmation bias only when the entry followed the caller", () => {
    const followed = Array.from({ length: 4 }, (_, index) =>
      row(`follow-${index}`, index, { pnl: -30, amount: 80, kol: kol("Cented", "before"), symbol: `FOLLOW${index}` }),
    );
    const led = Array.from({ length: 4 }, (_, index) =>
      row(`led-${index}`, index + 4, { pnl: 20, amount: 20, kol: kol("Orangie", "after"), symbol: `LED${index}` }),
    );
    const trades = [...followed, ...led];
    const bounds = bookBounds({ trades, accountUsd: 9.9, rules: [] });
    const habits = tradingHabits(trades, bounds);
    const confirmation = habits.negative.find((item) => item.id === "confirmation");
    expect(confirmation?.title).toBe("Confirmation bias");
    expect(confirmation?.mark).toBe("Bias");
    expect(confirmation?.detail).toMatch(/followed that buy/);
    expect(confirmation?.detail).toMatch(/stays at \$0\.50/);
    expect(confirmation?.detail).toMatch(/5% of the \$9\.90/);
    expect(confirmation?.detail).not.toMatch(/arrived after|as much as|caller's size|match the kol/i);
    expect(confirmation?.tradeIds).toHaveLength(4);
    expect(habits.negative.some((item) => /after the fact/i.test(item.title))).toBe(false);
    expect(habits.positive.find((item) => item.id === "caller-early")).toBeUndefined();
  });

  it("names the house-money effect when a larger ticket after a win loses", () => {
    const trades = [
      row("w1", 1, { pnl: 10, amount: 20 }),
      row("up1", 2, { pnl: -30, amount: 80, symbol: "PRESS1" }),
      row("w2", 3, { pnl: 10, amount: 20 }),
      row("up2", 4, { pnl: -30, amount: 80, symbol: "PRESS2" }),
      row("w3", 5, { pnl: 10, amount: 20 }),
      row("up3", 6, { pnl: -30, amount: 80, symbol: "PRESS3" }),
      row("flat1", 7, { pnl: 12, amount: 20 }),
      row("flat2", 8, { pnl: 12, amount: 20 }),
    ];
    const habits = tradingHabits(trades);
    const pressed = habits.negative.find((item) => item.id === "size-after-win");
    expect(pressed?.title).toBe("House-money effect");
    expect(pressed?.mark).toBe("Bias");
    expect(pressed?.detail).toMatch(/Pressing the last win/);
    expect(pressed?.detail).toMatch(/30 minutes/);
    expect(pressed?.tradeIds.length).toBeGreaterThanOrEqual(3);
    expect(habits.positive.find((item) => item.id === "size-press-paid")).toBeUndefined();
  });

  it("does not call a larger ticket hours after a win the house-money effect", () => {
    const trades = [0, 1, 2].flatMap((index) => {
      const winAt = Date.UTC(2026, 9, 10, 12 + index * 5, 0, 0);
      return [
        row(`w-${index}`, index, { pnl: 10, amount: 20, at: new Date(winAt).toISOString(), exitAt: new Date(winAt + 60_000).toISOString() }),
        row(`up-${index}`, index, {
          pnl: -30,
          amount: 80,
          at: new Date(winAt + 3 * 60 * 60_000).toISOString(),
          symbol: `LATER${index}`,
        }),
      ];
    });
    expect(tradingHabits(trades).negative.some((item) => item.title === "House-money effect")).toBe(false);
  });

  it("names the disposition effect only when the red trades were held longer", () => {
    const longer = [
      ...Array.from({ length: 4 }, (_, index) => row(`w-${index}`, index, { pnl: 20, hold: 4, symbol: `WIN${index}` })),
      ...Array.from({ length: 4 }, (_, index) => row(`l-${index}`, index + 4, { pnl: -18, hold: 40, symbol: `LOSS${index}` })),
    ];
    const habit = tradingHabits(longer).negative.find((item) => item.id === "hold-losers");
    expect(habit?.title).toBe("Disposition effect");
    expect(habit?.mark).toBe("Bias");
    expect(habit?.detail).toMatch(/Holding the red trades longer/);
    expect(habit?.tradeIds).toHaveLength(4);

    const even = [
      ...Array.from({ length: 4 }, (_, index) => row(`ew-${index}`, index, { pnl: 20, hold: 10 })),
      ...Array.from({ length: 4 }, (_, index) => row(`el-${index}`, index + 4, { pnl: -18, hold: 10 })),
    ];
    expect(tradingHabits(even).negative.some((item) => item.title === "Disposition effect")).toBe(false);

    const mild = [
      ...Array.from({ length: 4 }, (_, index) => row(`mw-${index}`, index, { pnl: 20, hold: 10 })),
      ...Array.from({ length: 4 }, (_, index) => row(`ml-${index}`, index + 4, { pnl: -18, hold: 16 })),
    ];
    expect(tradingHabits(mild).negative.some((item) => item.title === "Disposition effect")).toBe(false);
  });
});

function kol(name: string, timing: KolTag["timing"]): KolTag {
  return { id: name.toLowerCase(), handle: name.toLowerCase(), name, timing };
}

function row(
  id: string,
  hour: number,
  extra: {
    pnl?: number;
    amount?: number;
    mc?: number;
    ath?: number;
    symbol?: string;
    buys?: number;
    kol?: KolTag;
    mint?: string;
    hold?: number;
    at?: string;
    exitAt?: string;
    graduation?: number;
    volumeFalling?: boolean;
    averagedDown?: boolean;
  } = {},
): RoundTrip {
  const amount = extra.amount ?? 20;
  const pnl = extra.pnl ?? 0;
  const mc = extra.mc ?? 40_000;
  const entryMs = extra.at ? Date.parse(extra.at) : Date.UTC(2026, 9, 10, 16, 0, 0) + hour * 2 * 60_000;
  return {
    id,
    mint: extra.mint ?? id,
    symbol: extra.symbol ?? id.toUpperCase(),
    name: extra.symbol ?? id,
    metas: ["other"],
    terminal: "wallet",
    entryAt: new Date(entryMs).toISOString(),
    exitAt: extra.exitAt ?? new Date(entryMs + 30_000).toISOString(),
    entryMarketCapUsd: mc,
    exitMarketCapUsd: mc,
    liquidityUsd: 100_000,
    amountUsd: amount,
    pnlUsd: pnl,
    pnlPct: amount > 0 ? (pnl / amount) * 100 : 0,
    holdMinutes: extra.hold ?? 10,
    kols: extra.kol ? [extra.kol] : [],
    minutesFromLaunch: -1,
    buys: extra.buys ?? 1,
    sells: 1,
    athMarketCapUsd: extra.ath,
    graduationMarketCapUsd: extra.graduation,
    volumeFalling: extra.volumeFalling,
    averagedDown: extra.averagedDown,
  };
}
