import { describe, expect, it } from "vitest";
import { endOfDayReport, latestClosedDay, RATIONALITY_NOTE } from "@/lib/analysis/day-report";
import type { RoundTrip } from "@/lib/types";

describe("end of day report", () => {
  it("groups closes on the America/New_York exit day", () => {
    const trades = [
      row("late", "2026-10-23", 0, {
        at: "2026-10-24T01:14:45.000Z",
        pnl: -149,
        amount: 200,
        symbol: "ELON",
      }),
      row("day", "2026-10-24", 0, {
        at: "2026-10-24T16:00:00.000Z",
        pnl: 12,
        amount: 10,
        symbol: "VAN",
      }),
    ];
    const friday = endOfDayReport(trades, "2026-10-23");
    const saturday = endOfDayReport(trades, "2026-10-24");
    expect(friday.label).toBe("Friday, October 23, 2026");
    expect(friday.tradeCount).toBe(1);
    expect(friday.pnlUsd).toBe(-149);
    expect(friday.worst.map((fill) => fill.symbol)).toEqual(["ELON"]);
    expect(saturday.label).toBe("Saturday, October 24, 2026");
    expect(saturday.pnlUsd).toBe(12);
    expect(saturday.best).toEqual([{ id: "day", symbol: "VAN", pnlUsd: 12, amountUsd: 10 }]);
    expect(saturday.worst).toEqual([]);
    expect(latestClosedDay(trades)).toBe("2026-10-24");
    expect(latestClosedDay([])).toBeNull();
  });

  it("ranks the best three wins and the worst three losses, and keeps the size", () => {
    const trades = [
      row("a", "2026-10-24", 1, { pnl: 5, amount: 20, symbol: "AAA" }),
      row("b", "2026-10-24", 2, { pnl: 40, amount: 22, symbol: "BBB" }),
      row("c", "2026-10-24", 3, { pnl: 10, amount: 21, symbol: "CCC" }),
      row("d", "2026-10-24", 4, { pnl: 1, amount: 19, symbol: "DDD" }),
      row("e", "2026-10-24", 5, { pnl: -40, amount: 20, symbol: "EEE" }),
      row("f", "2026-10-24", 6, { pnl: -5, amount: 18, symbol: "FFF" }),
      row("g", "2026-10-24", 7, { pnl: -10, amount: 17, symbol: "GGG" }),
      row("h", "2026-10-24", 8, { pnl: -1, amount: 16, symbol: "HHH" }),
    ];
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.best.map((fill) => [fill.symbol, fill.pnlUsd, fill.amountUsd])).toEqual([
      ["BBB", 40, 22],
      ["CCC", 10, 21],
      ["AAA", 5, 20],
    ]);
    expect(report.worst.map((fill) => [fill.symbol, fill.pnlUsd])).toEqual([
      ["EEE", -40],
      ["GGG", -10],
      ["FFF", -5],
    ]);
    expect(report.noWinningTrade).toBe(false);
    expect(report.leastBad).toBeNull();
  });

  it("shows the wins that exist when a day has fewer than three", () => {
    const trades = [
      row("win", "2026-10-24", 1, { pnl: 4, amount: 20, symbol: "ONLY" }),
      row("loss", "2026-10-24", 2, { pnl: -3, amount: 20, symbol: "LOST" }),
    ];
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.best).toHaveLength(1);
    expect(report.best[0].symbol).toBe("ONLY");
    expect(report.worst).toHaveLength(1);
  });

  it("names the least-bad close only when a losing day has a real gap", () => {
    const similar = ["a", "b", "c"].map((id, index) =>
      row(id, "2026-10-24", index, { pnl: -10 - index, amount: 20, symbol: id.toUpperCase() }),
    );
    const flat = endOfDayReport(similar, "2026-10-24");
    expect(flat.noWinningTrade).toBe(true);
    expect(flat.best).toEqual([]);
    expect(flat.leastBad).toBeNull();

    const gapped = [
      row("tiny", "2026-10-24", 1, { pnl: -2, amount: 20, symbol: "TINY" }),
      row("mid", "2026-10-24", 2, { pnl: -30, amount: 20, symbol: "MID" }),
      row("deep", "2026-10-24", 3, { pnl: -40, amount: 20, symbol: "DEEP" }),
    ];
    const honest = endOfDayReport(gapped, "2026-10-24");
    expect(honest.noWinningTrade).toBe(true);
    expect(honest.leastBad).toMatchObject({ symbol: "TINY", pnlUsd: -2, amountUsd: 20 });
    expect(honest.worst[0].symbol).toBe("DEEP");
  });

  it("scores a losing day of small tickets a 10 when the fills stay clean", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`clean-${minute}`, "2026-10-24", minute, { pnl: -5, amount: 20, mc: 30_000, ath: 100_000 }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.pnlUsd).toBe(-20);
    expect(report.score).toBe(10);
    expect(report.rational).toBe(true);
    expect(report.biases).toEqual([]);
    expect(report.lead).toMatch(/traded more rationally that day/);
    expect(report.lead).toMatch(/nothing sized up after a loss/);
    expect(report.why).toMatch(/did not repeat a costly pattern/);
    expect(report.why).toMatch(/nothing sized up after a loss/);
    expect(RATIONALITY_NOTE).toMatch(/10 is a day the fills did not repeat the costly patterns/);
  });

  it("will not round one costly fill back up to a 10", () => {
    const trades = Array.from({ length: 41 }, (_, minute) =>
      row(`slip-${minute}`, "2026-10-24", minute, {
        pnl: 2,
        amount: 20,
        buys: minute === 0 ? 2 : 1,
        averagedDown: minute === 0,
        mc: 30_000,
        ath: 100_000,
      }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.score).toBe(9);
    expect(report.rational).toBe(true);
    expect(report.biases.map((bias) => bias.title)).not.toContain("Added to the same coin");
    expect(report.why).toMatch(/averaged down/);
  });

  it("scores a day of revenge size-ups a 1 and does not borrow that bias onto a clean day", () => {
    const earlier = [0, 1, 2, 3, 4, 5, 6, 7].map((minute) =>
      row(`base-${minute}`, "2026-10-23", minute, { pnl: 5, amount: 20 }),
    );
    const revengeDay = [
      row("small", "2026-10-24", 0, { pnl: -20, amount: 20, symbol: "SMALL" }),
      ...[1, 2, 3, 4].map((minute) =>
        row(`up-${minute}`, "2026-10-24", minute, { pnl: -30, amount: 20 * 2 ** minute, symbol: `UP${minute}` }),
      ),
    ];
    const trades = [...earlier, ...revengeDay];
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.pnlUsd).toBe(-140);
    expect(report.score).toBe(1);
    expect(report.rational).toBe(false);
    expect(report.biases.map((bias) => bias.title)).toContain("Revenge trading");
    expect(report.lead).toMatch(/dominant bias was revenge trading/i);
    expect(report.lead).toMatch(/\$20/);
    expect(report.lead).toMatch(/\$120/);
    expect(report.lead).not.toMatch(/more rationally/);
    expect(report.why).toMatch(/sizing up after a loss/);

    const before = endOfDayReport(trades, "2026-10-23");
    expect(before.pnlUsd).toBe(40);
    expect(before.score).toBe(10);
    expect(before.biases).toEqual([]);
  });

  it("does not invent revenge from the day's own median when the tickets never cleared the book's usual size", () => {
    const earlier = [0, 1, 2, 3, 4, 5, 6, 7].map((minute) =>
      row(`usual-${minute}`, "2026-10-23", minute, { pnl: 5, amount: 40 }),
    );
    const day = [
      ...[0, 1, 2].map((minute) => row(`small-${minute}`, "2026-10-24", minute, { pnl: -1, amount: 10 })),
      ...[3, 4, 5].map((minute) => row(`mid-${minute}`, "2026-10-24", minute, { pnl: -8, amount: 30 })),
    ];
    const report = endOfDayReport([...earlier, ...day], "2026-10-24");
    expect(report.pnlUsd).toBe(-27);
    expect(report.score).toBe(10);
    expect(report.rational).toBe(true);
    expect(report.biases.map((bias) => bias.title)).not.toContain("Revenge trading");
    expect(report.lead).toMatch(/more rationally/);
  });

  it("scores size-ups low even when those tickets made money, without calling the win revenge trading", () => {
    const earlier = [0, 1, 2, 3, 4, 5, 6, 7].map((minute) =>
      row(`base-${minute}`, "2026-10-23", minute, { pnl: 5, amount: 20, ath: null }),
    );
    const day = [0, 1, 2].flatMap((index) => [
      row(`loss-${index}`, "2026-10-24", index * 2, { pnl: -5, amount: 20, symbol: `LOSS${index}`, ath: null }),
      row(`press-${index}`, "2026-10-24", index * 2 + 1, { pnl: 10, amount: 80, symbol: `PRESS${index}`, ath: null }),
    ]);
    const report = endOfDayReport([...earlier, ...day], "2026-10-24");
    expect(report.score).toBe(3);
    expect(report.rational).toBe(false);
    expect(report.biases.map((bias) => bias.title)).not.toContain("Revenge trading");
    expect(report.lead).toMatch(/sized up after a loss/);
    expect(report.lead).toMatch(/made \$30/);
    expect(report.lead).not.toMatch(/more rationally/);
    expect(report.why).toMatch(/sizing up after a loss/);
  });

  it("names FOMO when entries bought the bond while volume was falling", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`fade-${minute}`, "2026-10-24", minute, {
        pnl: -20,
        amount: 20,
        mc: 80_000,
        ath: 90_000,
        graduation: 43_000,
        volumeFalling: true,
        symbol: `FADE${minute}`,
      }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.score).toBe(1);
    expect(report.rational).toBe(false);
    expect(report.biases.map((bias) => bias.title)).toContain("FOMO");
    expect(report.lead).toMatch(/graduation price while volume was falling/);
    expect(report.lead).not.toMatch(/75%|more rationally/);
    expect(report.why).toMatch(/fading bond/);
  });

  it("does not score a near-high entry as FOMO when volume is still rising", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`rise-${minute}`, "2026-10-24", minute, {
        pnl: -20,
        amount: 20,
        mc: 90_000,
        ath: 100_000,
        graduation: 43_000,
        volumeFalling: false,
        symbol: `RISE${minute}`,
      }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.score).toBe(10);
    expect(report.rational).toBe(true);
    expect(report.biases.map((bias) => bias.title)).not.toContain("FOMO");
    expect(report.lead).not.toMatch(/FOMO|75%/);
    expect(report.why).not.toMatch(/near the high/);
    expect(report.why).toMatch(/did not repeat a costly pattern/);
  });

  it("keeps a paid fading-bond entry out of the FOMO label and still scores that chase low", () => {
    const near = [0, 1, 2, 3].map((minute) =>
      row(`near-${minute}`, "2026-10-24", minute, {
        pnl: 20,
        amount: 20,
        mc: 90_000,
        ath: 100_000,
        graduation: 43_000,
        volumeFalling: true,
      }),
    );
    const mid = [4, 5, 6, 7].map((minute) =>
      row(`mid-${minute}`, "2026-10-24", minute, {
        pnl: -10,
        amount: 20,
        mc: 20_000,
        ath: 100_000,
        graduation: 43_000,
        volumeFalling: false,
      }),
    );
    const report = endOfDayReport([...near, ...mid], "2026-10-24");
    expect(report.score).toBe(3);
    expect(report.biases.map((bias) => bias.title)).not.toContain("FOMO");
    expect(report.rational).toBe(false);
    expect(report.lead).not.toMatch(/more rationally|75%/);
    expect(report.lead).toMatch(/volume was falling/);
    expect(report.why).toMatch(/fading bond/);
  });

  it("calls a day rational and names the under-high tendency when that is what paid", () => {
    const under = [0, 1, 2, 3].map((minute) =>
      row(`under-${minute}`, "2026-10-24", minute, { pnl: 20, amount: 20, mc: 30_000, ath: 100_000, symbol: `OFF${minute}` }),
    );
    const mid = [4, 5, 6, 7].map((minute) =>
      row(`mid-${minute}`, "2026-10-24", minute, { pnl: -10, amount: 20, mc: 60_000, ath: 100_000 }),
    );
    const report = endOfDayReport([...under, ...mid], "2026-10-24");
    expect(report.score).toBe(10);
    expect(report.rational).toBe(true);
    expect(report.biases).toEqual([]);
    expect(report.tendency?.title).toBe("Bought well under the high");
    expect(report.lead).toMatch(/traded more rationally that day/);
    expect(report.lead).toMatch(/tendency that paid/);
    expect(report.lead).toMatch(/45% of that coin's high/);
  });

  it("names the sunk-cost fallacy only for a re-entry after a red close", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`again-${minute}`, "2026-10-24", minute, {
        pnl: -12,
        amount: 20,
        mint: "same-mint",
        symbol: "AGAIN",
      }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.score).toBe(1);
    expect(report.biases.map((bias) => bias.title)).toEqual(["Sunk-cost fallacy"]);
    expect(report.lead).toMatch(/after a red close/);
    expect(report.lead).not.toMatch(/more rationally/);
    expect(report.why).toMatch(/re-entering losers/);
  });

  it("names adding to a coin and a heavy pool ticket when those clusters lost", () => {
    const adds = [
      ...[0, 1, 2].map((minute) =>
        row(`add-${minute}`, "2026-10-24", minute, { pnl: -20, amount: 20, buys: 3, averagedDown: true, symbol: `ADD${minute}` }),
      ),
      ...[3, 4, 5].map((minute) => row(`once-${minute}`, "2026-10-24", minute, { pnl: 10, amount: 20, buys: 1 })),
    ];
    const added = endOfDayReport(adds, "2026-10-24");
    expect(added.score).toBe(6);
    expect(added.biases.map((bias) => bias.title)).toContain("Averaging down");
    expect(added.biases.map((bias) => bias.title)).not.toContain("Added to the same coin");
    expect(added.rational).toBe(false);

    const heavy = [
      ...[0, 1, 2].map((minute) =>
        row(`heavy-${minute}`, "2026-10-24", minute, { pnl: -15, amount: 20, liquidity: 500, symbol: `HEAVY${minute}` }),
      ),
      ...[3, 4, 5].map((minute) =>
        row(`light-${minute}`, "2026-10-24", minute, { pnl: 8, amount: 20, liquidity: 10_000 }),
      ),
    ];
    const pool = endOfDayReport(heavy, "2026-10-24");
    expect(pool.score).toBe(6);
    expect(pool.biases.map((bias) => bias.title)).toContain("The ticket was large for the pool");
    expect(pool.lead).toMatch(/2% of the pool/);
  });

  it("has nothing to score when the selected day has no closes", () => {
    const trades = [row("other", "2026-10-23", 1, { pnl: 5, amount: 20 })];
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.tradeCount).toBe(0);
    expect(report.score).toBeNull();
    expect(report.pnlUsd).toBe(0);
    expect(report.best).toEqual([]);
    expect(report.worst).toEqual([]);
    expect(report.lead).toMatch(/No closed trades/);
    expect(report.label).toBe("Saturday, October 24, 2026");
  });
});

function stamp(day: string, minute: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date, 16, minute, 0)).toISOString();
}

function row(
  id: string,
  day: string,
  minute: number,
  extra: {
    pnl?: number;
    amount?: number;
    mc?: number;
    ath?: number | null;
    symbol?: string;
    buys?: number;
    mint?: string;
    liquidity?: number;
    at?: string;
    graduation?: number;
    volumeFalling?: boolean;
    averagedDown?: boolean;
  } = {},
): RoundTrip {
  const amount = extra.amount ?? 20;
  const pnl = extra.pnl ?? 0;
  const mc = extra.mc ?? 30_000;
  const at = extra.at ?? stamp(day, minute);
  return {
    id,
    mint: extra.mint ?? id,
    symbol: extra.symbol ?? id.toUpperCase(),
    name: extra.symbol ?? id,
    metas: ["other"],
    terminal: "wallet",
    entryAt: at,
    exitAt: at,
    entryMarketCapUsd: mc,
    exitMarketCapUsd: mc,
    liquidityUsd: extra.liquidity ?? 100_000,
    amountUsd: amount,
    pnlUsd: pnl,
    pnlPct: amount > 0 ? (pnl / amount) * 100 : 0,
    holdMinutes: 5,
    kols: [],
    minutesFromLaunch: -1,
    buys: extra.buys ?? 1,
    sells: 1,
    athMarketCapUsd: extra.ath === null ? undefined : (extra.ath ?? 100_000),
    graduationMarketCapUsd: extra.graduation,
    volumeFalling: extra.volumeFalling,
    averagedDown: extra.averagedDown,
  };
}
