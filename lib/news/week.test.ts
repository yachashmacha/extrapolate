import { describe, expect, it } from "vitest";
import { assembleWeek, selectWeek, weekMove, type WeekQuote } from "@/lib/news/week";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-26T06:30:00.000Z");

function quote(patch: Partial<WeekQuote> & Pick<WeekQuote, "id" | "symbol" | "changePct">): WeekQuote {
  return {
    name: patch.symbol,
    priceUsd: 1,
    marketCapUsd: 1_000_000_000,
    ...patch,
  };
}

describe("week's top ten", () => {
  it("keeps the ten strongest weeks among the largest coins", () => {
    const quotes = Array.from({ length: 12 }, (_, index) =>
      quote({ id: `c${index}`, symbol: `c${index}`, changePct: index, marketCapUsd: 1_000_000_000 - index }),
    );
    const tickers = selectWeek(quotes, new Map(), NOW);
    expect(tickers).toHaveLength(10);
    expect(tickers.map((ticker) => ticker.symbol)).toEqual(["C11", "C10", "C9", "C8", "C7", "C6", "C5", "C4", "C3", "C2"]);
  });

  it("drops a peg and a week that the chart cannot support", () => {
    const quotes = [
      quote({ id: "usdt", symbol: "usdt", changePct: 40, marketCapUsd: 9_000_000_000 }),
      quote({ id: "baby", symbol: "babyclaw", changePct: 56_177, marketCapUsd: 90_000_000 }),
      quote({ id: "pepe", symbol: "pepe", changePct: 9.1, priceUsd: 0.00000442, marketCapUsd: 1_800_000_000 }),
    ];
    const charts = new Map<string, [number, number][]>([["baby", []]]);
    expect(selectWeek(quotes, charts, NOW).map((ticker) => ticker.symbol)).toEqual(["PEPE"]);
  });

  it("uses the chart when a huge week actually spans the week", () => {
    const start = NOW - 6 * DAY;
    const move = weekMove(
      [
        [start, 1],
        [NOW - DAY, 4],
      ],
      NOW,
    );
    expect(move).toBeCloseTo(300, 5);
    const quotes = [quote({ id: "run", symbol: "run", changePct: 900, marketCapUsd: 80_000_000 })];
    const tickers = selectWeek(quotes, new Map([["run", [[start, 1], [NOW - 60_000, 4]]]]), NOW);
    expect(tickers[0]).toEqual(expect.objectContaining({ symbol: "RUN", changePct: 300 }));
  });

  it("ignores a chart that only covers a day", () => {
    expect(weekMove([[NOW - DAY, 1], [NOW - 60_000, 9]], NOW)).toBeNull();
  });

  it("reads the week's board from the markets list and leaves a broken week off", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/coins/markets")) {
        return Response.json([
          { id: "tether", symbol: "usdt", name: "Tether", current_price: 1, market_cap: 180_000_000_000, price_change_percentage_7d_in_currency: 0.01 },
          { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 80000, market_cap: 1_600_000_000_000, price_change_percentage_7d_in_currency: -3.1 },
          { id: "pepe", symbol: "pepe", name: "Pepe", current_price: 0.00000442, market_cap: 1_800_000_000, price_change_percentage_7d_in_currency: 9.06 },
          { id: "baby-claw", symbol: "babyclaw", name: "Baby Claw", current_price: 0.09, market_cap: 90_000_000, price_change_percentage_7d_in_currency: 56177 },
          { id: "memecore", symbol: "m", name: "MemeCore", current_price: 0.97, market_cap: 2_200_000_000, price_change_percentage_7d_in_currency: 35.7 },
        ]);
      }
      if (url.includes("/coins/baby-claw/market_chart")) return Response.json({ prices: [] });
      throw new Error(url);
    };
    const board = await assembleWeek(fetchImpl, NOW);
    expect(board.tickers.map((ticker) => ticker.symbol)).toEqual(["M", "PEPE", "BTC"]);
    expect(board.tickers[0].changePct).toBe(35.7);
    expect(board.tickers[1].priceUsd).toBe(0.00000442);
  });
});
