import { describe, expect, it } from "vitest";
import { endOfDayReport, latestClosedDay, RATIONALITY_NOTE } from "@/lib/analysis/day-report";
import { baseRules, PACE_RULE_ID, PACE_RULE_TEXT } from "@/lib/rules";
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
    expect(saturday.best[0]).toMatchObject({ id: "day", symbol: "VAN", pnlUsd: 12, amountUsd: 10 });
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

  it("scores a losing day of small tickets in the 90s, never at 100%", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`clean-${minute}`, "2026-10-24", minute, { pnl: -5, amount: 20, mc: 30_000, ath: 100_000 }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.pnlUsd).toBe(-20);
    expect(report.score).toBe(95);
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.score).toBeLessThan(100);
    expect(report.rational).toBe(false);
    expect(report.biases).toEqual([]);
    expect(report.lead).toMatch(/trades stayed small/);
    expect(report.lead).toMatch(/nothing sized up after a loss/);
    expect(report.lead).not.toMatch(/more rationally/);
    expect(report.why).toMatch(/did not repeat a costly pattern/);
    expect(report.why).toMatch(/nothing sized up after a loss/);
    expect(report.why).toMatch(/red close keeps the percent under 100/);
    expect(RATIONALITY_NOTE).toMatch(/100% is a day the trades did not repeat the costly patterns/);
    expect(RATIONALITY_NOTE).toMatch(/red day cannot be 100%/);
    expect(RATIONALITY_NOTE).not.toMatch(/10 is a day/);
  });

  it("will not round one costly fill back up to 100%", () => {
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
    expect(report.score).toBe(99);
    expect(report.rational).toBe(true);
    expect(report.biases.map((bias) => bias.title)).not.toContain("Added to the same coin");
    expect(report.why).toMatch(/averaged down/);
  });

  it("scores a day of revenge size-ups a 1 and does not borrow that bias onto a clean day", () => {
    const earlier = [0, 1, 2, 3, 4, 5, 6, 7].map((minute) =>
      row(`base-${minute}`, "2026-10-23", minute, { pnl: 5, amount: 20 }),
    );
    const revengeDay = [
      ...[0, 1, 2].flatMap((index) => [
        row(`small-${index}`, "2026-10-24", index * 2, { pnl: -20, amount: 20, symbol: "SMALL" }),
        row(`up-${index}`, "2026-10-24", index * 2 + 1, { pnl: -30, amount: 40, symbol: `UP${index}` }),
      ]),
      ...[6, 7, 8].map((minute) => row(`win-${minute}`, "2026-10-24", minute, { pnl: 10, amount: 20 })),
    ];
    const trades = [...earlier, ...revengeDay];
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.pnlUsd).toBe(-120);
    expect(report.score).toBeLessThan(40);
    expect(report.rational).toBe(false);
    expect(report.biases.map((bias) => bias.title)).toContain("Revenge trading");
    expect(report.lead).toMatch(/dominant bias was revenge trading/i);
    expect(report.lead).toMatch(/about your usual \$20/);
    expect(report.lead).toMatch(/\$90/);
    expect(report.lead).not.toMatch(/more rationally/);
    expect(report.why).toMatch(/sizing up after a loss/);

    const before = endOfDayReport(trades, "2026-10-23");
    expect(before.pnlUsd).toBe(40);
    expect(before.score).toBe(100);
    expect(before.biases).toEqual([]);
  });

  it("does not call a size-up after an already large loss revenge", () => {
    const earlier = [0, 1, 2, 3, 4, 5, 6, 7].map((minute) =>
      row(`base-${minute}`, "2026-10-23", minute, { pnl: 5, amount: 20 }),
    );
    const day = [
      row("huge", "2026-10-24", 0, { pnl: -40, amount: 80, symbol: "HUGE" }),
      row("chase", "2026-10-24", 1, { pnl: -50, amount: 200, symbol: "CHASE" }),
      row("later", "2026-10-24", 40, { pnl: -30, amount: 90, symbol: "LATER" }),
    ];
    const report = endOfDayReport([...earlier, ...day], "2026-10-24");
    expect(report.biases.map((bias) => bias.title)).not.toContain("Revenge trading");
    expect(report.lead).not.toMatch(/revenge trading/i);
    expect(report.biases.map((bias) => bias.title)).toContain("The trade was well above your usual size");
    expect(report.lead).toMatch(/1\.5×/);
    expect(report.lead).not.toMatch(/pool|% of the coin|% of supply/i);
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
    expect(report.score).toBe(95);
    expect(report.score).toBeLessThan(100);
    expect(report.rational).toBe(false);
    expect(report.biases.map((bias) => bias.title)).not.toContain("Revenge trading");
    expect(report.lead).toMatch(/trades stayed small/);
    expect(report.lead).not.toMatch(/more rationally/);
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
    expect(report.score).toBe(48);
    expect(report.rational).toBe(false);
    expect(report.biases.map((bias) => bias.title)).not.toContain("Revenge trading");
    expect(report.lead).toMatch(/sized up after a loss/);
    expect(report.lead).toMatch(/made \$30/);
    expect(report.lead).not.toMatch(/more rationally/);
    expect(report.why).toMatch(/sizing up after a loss/);
  });

  it("names FOMO when volume and market cap both dropped after the entry, at any market cap", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`fade-${minute}`, "2026-10-24", minute, {
        pnl: -20,
        amount: 20,
        mc: 12_000,
        ath: 90_000,
        volumeDroppedAfter: true,
        mcDroppedAfter: true,
        symbol: `FADE${minute}`,
      }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.score).toBe(19);
    expect(report.rational).toBe(false);
    expect(report.biases.map((bias) => bias.title)).toContain("FOMO");
    expect(report.lead).toMatch(/volume started dropping and market cap dropped/);
    expect(report.lead).not.toMatch(/graduation|bond|75%|more rationally/i);
    expect(report.why).toMatch(/volume and market cap dropping after the entry/);
  });

  it("does not score an entry as FOMO when volume kept rising after it", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`rise-${minute}`, "2026-10-24", minute, {
        pnl: -20,
        amount: 20,
        mc: 90_000,
        ath: 100_000,
        volumeDroppedAfter: false,
        mcDroppedAfter: true,
        symbol: `RISE${minute}`,
      }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.score).toBe(90);
    expect(report.score).toBeLessThan(100);
    expect(report.rational).toBe(false);
    expect(report.biases.map((bias) => bias.title)).not.toContain("FOMO");
    expect(report.lead).toMatch(/trades stayed small/);
    expect(report.lead).not.toMatch(/FOMO|75%|more rationally/);
    expect(report.why).not.toMatch(/near the high|graduation|bond/i);
    expect(report.why).toMatch(/did not repeat a costly pattern/);
    expect(report.why).toMatch(/no trade faded after the entry/);
  });

  it("does not call a missing post-entry read a fade", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`miss-${minute}`, "2026-10-24", minute, {
        pnl: -20,
        amount: 20,
        mc: 12_000,
        volumeDroppedAfter: true,
      }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.score).toBe(91);
    expect(report.score).toBeLessThan(100);
    expect(report.biases.map((bias) => bias.title)).not.toContain("FOMO");
    expect(report.lead).not.toMatch(/FOMO|faded after|more rationally/);
    expect(report.why).not.toMatch(/faded after/);
  });

  it("keeps a paid post-entry fade out of the FOMO label and still scores that chase low", () => {
    const faded = [0, 1, 2, 3].map((minute) =>
      row(`fade-${minute}`, "2026-10-24", minute, {
        pnl: 20,
        amount: 20,
        mc: 12_000,
        ath: 100_000,
        volumeDroppedAfter: true,
        mcDroppedAfter: true,
      }),
    );
    const mid = [4, 5, 6, 7].map((minute) =>
      row(`mid-${minute}`, "2026-10-24", minute, {
        pnl: -10,
        amount: 20,
        mc: 20_000,
        ath: 100_000,
        volumeDroppedAfter: false,
        mcDroppedAfter: false,
      }),
    );
    const report = endOfDayReport([...faded, ...mid], "2026-10-24");
    expect(report.score).toBe(48);
    expect(report.biases.map((bias) => bias.title)).not.toContain("FOMO");
    expect(report.rational).toBe(false);
    expect(report.lead).not.toMatch(/more rationally|75%|bond|graduation/i);
    expect(report.lead).toMatch(/volume started dropping and market cap dropped/);
    expect(report.why).toMatch(/volume and market cap dropping after the entry/);
  });

  it("calls a day rational and names the under-high tendency when that is what paid", () => {
    const under = [0, 1, 2, 3].map((minute) =>
      row(`under-${minute}`, "2026-10-24", minute, { pnl: 20, amount: 20, mc: 30_000, ath: 100_000, symbol: `OFF${minute}` }),
    );
    const mid = [4, 5, 6, 7].map((minute) =>
      row(`mid-${minute}`, "2026-10-24", minute, { pnl: -10, amount: 20, mc: 60_000, ath: 100_000 }),
    );
    const report = endOfDayReport([...under, ...mid], "2026-10-24");
    expect(report.score).toBe(100);
    expect(report.rational).toBe(true);
    expect(report.biases).toEqual([]);
    expect(report.tendency?.title).toBe("Bought well under the high");
    expect(report.lead).toMatch(/traded more rationally that day/);
    expect(report.lead).toMatch(/tendency that paid/);
    expect(report.lead).toMatch(/45% of that coin's high/);
  });

  it("names a break-even chase only for a re-entry after a red close", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`again-${minute}`, "2026-10-24", minute, {
        pnl: -12,
        amount: 20,
        mint: "same-mint",
        symbol: "AGAIN",
      }),
    );
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.score).toBe(29);
    expect(report.biases.map((bias) => bias.title)).toEqual(["Break-even chase"]);
    expect(report.lead).toMatch(/pattern in the closes/);
    expect(report.lead).toMatch(/after a red close/);
    expect(report.lead).not.toMatch(/sunk-cost|trying to get back/i);
    expect(report.lead).not.toMatch(/more rationally/);
    expect(report.why).toMatch(/re-entering losers/);
  });

  it("does not call an entry sunk cost when that coin's red close is still in the future", () => {
    const first = row("first", "2026-10-24", 0, { pnl: -20, mint: "same-mint", symbol: "SAME", exitMinute: 40 });
    const during = row("during", "2026-10-24", 10, { pnl: -8, mint: "same-mint", symbol: "SAME", exitMinute: 15 });
    const report = endOfDayReport([first, during], "2026-10-24");
    expect(report.biases.map((bias) => bias.title)).not.toContain("Break-even chase");
  });

  it("names averaging down, and does not treat a normal share of the pool as a bias", () => {
    const adds = [
      ...[0, 1, 2].map((minute) =>
        row(`add-${minute}`, "2026-10-24", minute, { pnl: -20, amount: 20, buys: 3, averagedDown: true, symbol: `ADD${minute}` }),
      ),
      ...[3, 4, 5].map((minute) => row(`once-${minute}`, "2026-10-24", minute, { pnl: 10, amount: 20, buys: 1 })),
    ];
    const added = endOfDayReport(adds, "2026-10-24");
    expect(added.score).toBe(40);
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
    const copy = `${pool.lead} ${pool.why} ${pool.biases.map((bias) => bias.sentence).join(" ")}`;
    expect(pool.score).toBe(95);
    expect(pool.biases.map((bias) => bias.title)).not.toContain("The ticket was large for the pool");
    expect(copy).not.toMatch(/large for the pool|% of the pool|% of the coin|% of supply|percent of the pool/i);
  });

  it("scores a cluster well above this trader's own median and states the multiple", () => {
    const earlier = [0, 1, 2, 3, 4, 5, 6, 7].map((minute) =>
      row(`usual-${minute}`, "2026-10-23", minute, { pnl: 5, amount: 20 }),
    );
    const day = [
      ...[0, 1, 2].map((minute) =>
        row(`big-${minute}`, "2026-10-24", minute, { pnl: -15, amount: 80, liquidity: 100_000, symbol: `BIG${minute}` }),
      ),
      ...[3, 4, 5].map((minute) =>
        row(`flat-${minute}`, "2026-10-24", minute, { pnl: 8, amount: 20, liquidity: 500 }),
      ),
    ];
    const report = endOfDayReport([...earlier, ...day], "2026-10-24");
    const copy = `${report.lead} ${report.why} ${report.biases.map((bias) => bias.sentence).join(" ")}`;
    expect(report.score).toBe(45);
    expect(report.biases.map((bias) => bias.title)).toContain("The trade was well above your usual size");
    expect(report.lead).toMatch(/1\.5×/);
    expect(report.lead).toMatch(/4×/);
    expect(report.lead).toMatch(/\$20/);
    expect(copy).not.toMatch(/large for the pool|% of the pool|% of the coin|% of supply/i);
  });

  it("uses the size of the loss, and weighs a named pattern more than the red close", () => {
    const small = [0, 1, 2, 3].map((minute) =>
      row(`small-${minute}`, "2026-10-24", minute, { pnl: -5, amount: 20 }),
    );
    const larger = [0, 1, 2, 3].map((minute) =>
      row(`large-${minute}`, "2026-10-24", minute, { pnl: -100, amount: 100 }),
    );
    const patterned = [
      row("seed", "2026-10-24", 0, { pnl: -40, amount: 20, mint: "again", symbol: "AGAIN" }),
      ...[1, 2, 3].map((minute) =>
        row(`again-${minute}`, "2026-10-24", minute, { pnl: -80, amount: 80, mint: "again", symbol: "AGAIN" }),
      ),
    ];
    const green = [0, 1, 2, 3].map((minute) =>
      row(`green-${minute}`, "2026-10-24", minute, { pnl: 8, amount: 20 }),
    );
    const smallReport = endOfDayReport(small, "2026-10-24");
    const largerReport = endOfDayReport(larger, "2026-10-24");
    const patternedReport = endOfDayReport(patterned, "2026-10-24");
    const greenReport = endOfDayReport(green, "2026-10-24");

    expect(smallReport.biases).toEqual([]);
    expect(largerReport.biases).toEqual([]);
    expect(smallReport.score).toBeGreaterThanOrEqual(90);
    expect(largerReport.score).toBeGreaterThanOrEqual(90);
    expect(largerReport.score).toBeLessThan(smallReport.score!);
    expect(smallReport.score).toBeLessThan(100);
    expect(largerReport.score).toBeLessThan(100);
    expect(patternedReport.biases.map((bias) => bias.title)).toContain("Break-even chase");
    expect(patternedReport.score).toBeLessThan(60);
    expect(patternedReport.score!).toBeLessThan(smallReport.score! - 30);
    expect(greenReport.pnlUsd).toBeGreaterThan(0);
    expect(greenReport.biases).toEqual([]);
    expect(greenReport.score).toBe(100);
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

  it("lowers a green day when a close exited below half the entry", () => {
    const held = row("held", "2026-10-24", 1, { pnl: -30, amount: 10, mc: 40_000, exitMc: 10_000, symbol: "HELD" });
    const kept = [2, 3, 4].map((minute) =>
      row(`ok-${minute}`, "2026-10-24", minute, { pnl: 20, amount: 10, mc: 40_000, exitMc: 50_000, symbol: `OK${minute}` }),
    );
    const report = endOfDayReport([held, ...kept], "2026-10-24");
    expect(report.pnlUsd).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
    expect(report.rational).toBe(false);
    expect(report.lead).toMatch(/below 50% of the entry/);
    expect(report.lead).toMatch(/Exit the position if the chart goes below 50% of your position/);
    expect(report.why).toMatch(/broken base rule/);
    const named = [...report.best, ...report.worst].find((fill) => fill.symbol === "HELD");
    expect(named?.note).toMatch(/below 50%/);
    const clean = endOfDayReport(kept, "2026-10-24");
    expect(clean.score).toBe(100);
    expect(clean.lead).not.toMatch(/below 50%/);
  });

  it("does not call an exit above half, or exactly at half, a broken stop", () => {
    const above = [0, 1, 2, 3].map((minute) =>
      row(`above-${minute}`, "2026-10-24", minute, { pnl: 8, amount: 10, mc: 40_000, exitMc: 30_000 }),
    );
    const aboveReport = endOfDayReport(above, "2026-10-24");
    expect(aboveReport.score).toBe(100);
    expect(aboveReport.lead).not.toMatch(/below 50%/);
    expect(aboveReport.best.every((fill) => fill.note == null)).toBe(true);

    const atHalf = [0, 1, 2, 3].map((minute) =>
      row(`half-${minute}`, "2026-10-24", minute, { pnl: 4, amount: 10, mc: 40_000, exitMc: 20_000 }),
    );
    expect(endOfDayReport(atHalf, "2026-10-24").lead).not.toMatch(/below 50%/);
  });

  it("uses the close percent when the book has no price between entry and exit", () => {
    const trades = [
      row("deep", "2026-10-24", 1, { pnl: -12, amount: 20, mc: 0, symbol: "DEEP" }),
      ...[2, 3, 4].map((minute) => row(`up-${minute}`, "2026-10-24", minute, { pnl: 10, amount: 10, mc: 20_000, exitMc: 24_000 })),
    ];
    const report = endOfDayReport(trades, "2026-10-24");
    expect(report.pnlUsd).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
    expect(report.lead).toMatch(/below 50% of the entry/);
    expect([...report.best, ...report.worst].find((fill) => fill.symbol === "DEEP")?.note).toMatch(/below 50%/);
  });

  it("lowers a green day when a winning ticket was more than 10% of the portfolio", () => {
    const trades = [0, 1, 2, 3].map((minute) =>
      row(`win-${minute}`, "2026-10-24", minute, { pnl: 8, amount: 20, mc: 30_000, exitMc: 40_000, symbol: `WIN${minute}` }),
    );
    const report = endOfDayReport(trades, "2026-10-24", { accountUsd: 9.9 });
    expect(report.pnlUsd).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
    expect(report.rational).toBe(false);
    expect(report.lead).toMatch(/more than 10% of the portfolio/);
    expect(report.lead).toMatch(/including a winner/);
    expect(report.lead).toMatch(/10 percent of your portfolio/);
    expect(report.sizeNote).toMatch(/\$0\.99/);
    expect(report.sizeNote).toMatch(/10 percent of your portfolio/);
    expect(report.best.some((fill) => /more than 10%/.test(fill.note ?? ""))).toBe(true);

    const off = endOfDayReport(trades, "2026-10-24", {
      accountUsd: 9.9,
      rules: [
        { id: "base-exit-half", text: "Exit the position if the chart goes below 50% of your position.", active: true },
        { id: "base-size-tenth", text: "Trade with no more than 10 percent of your portfolio for your base trade.", active: false },
      ],
    });
    expect(off.lead).not.toMatch(/more than 10%/);
    expect(off.score).toBe(100);
  });

  it("does not dock a day when a $20 ticket only exceeds 10% of the later portfolio", () => {
    const early = row("early", "2026-10-24", 0, {
      pnl: 8,
      amount: 20,
      mc: 30_000,
      exitMc: 36_000,
      symbol: "EARLY",
      exitMinute: 10,
    });
    const wreck = row("wreck", "2026-10-24", 40, {
      pnl: -320,
      amount: 40,
      mc: 40_000,
      exitMc: 32_000,
      symbol: "WRECK",
      exitMinute: 70,
    });
    const trades = [early, wreck];
    const report = endOfDayReport(trades, "2026-10-24", { accountUsd: 188 });
    const off = endOfDayReport(trades, "2026-10-24", {
      accountUsd: 188,
      rules: [
        { id: "base-exit-half", text: "Exit the position if the chart goes below 50% of your position.", active: true },
        { id: "base-size-tenth", text: "Trade with no more than 10 percent of your portfolio for your base trade.", active: false },
      ],
    });
    expect(report.pnlUsd).toBeLessThan(0);
    expect(report.score).toBe(off.score);
    expect(report.lead).not.toMatch(/more than 10%/);
    expect(report.best.find((fill) => fill.symbol === "EARLY")?.note ?? "").not.toMatch(/10%/);
    expect(report.worst.find((fill) => fill.symbol === "WRECK")?.note ?? "").not.toMatch(/10%/);
    expect(report.sizeNote).toMatch(/\$18\.80/);
    expect(report.sizeNote).toMatch(/\$188/);
  });

  it("still docks a green day when $60 was over 10% of the portfolio at the entry", () => {
    const trades = [
      row("wide", "2026-10-24", 0, {
        pnl: 200,
        amount: 60,
        mc: 30_000,
        exitMc: 48_000,
        symbol: "WIDE",
        exitMinute: 20,
      }),
    ];
    const report = endOfDayReport(trades, "2026-10-24", { accountUsd: 700 });
    const off = endOfDayReport(trades, "2026-10-24", {
      accountUsd: 700,
      rules: [
        { id: "base-exit-half", text: "Exit the position if the chart goes below 50% of your position.", active: true },
        { id: "base-size-tenth", text: "Trade with no more than 10 percent of your portfolio for your base trade.", active: false },
      ],
    });
    expect(report.pnlUsd).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(off.score ?? 100);
    expect(report.lead).toMatch(/\$60 trade was over the \$50 line/);
    expect(report.lead).toMatch(/\$500 portfolio at that entry/);
    expect(report.lead).not.toMatch(/\$700/);
    expect(report.best[0]?.note).toMatch(/\$60 against a \$50 line on a \$500 portfolio/);
    expect(report.sizeNote).toMatch(/\$70/);
    expect(report.sizeNote).toMatch(/\$700/);
  });

  it("does not break a day of 50 closed round trips, and lowers a green day of 51", () => {
    const inside = greenCloses(50, "2026-10-24", "in");
    const held = endOfDayReport(inside, "2026-10-24");
    const heldOff = endOfDayReport(inside, "2026-10-24", { rules: paceOff() });
    expect(held.tradeCount).toBe(50);
    expect(inside.every((trade) => trade.buys === 2 && trade.sells === 1)).toBe(true);
    expect(held.pnlUsd).toBeGreaterThan(0);
    expect(held.score).toBe(heldOff.score);
    expect(held.lead).not.toContain(PACE_RULE_TEXT);
    expect(held.why).not.toMatch(/broken base rule/);

    const over = greenCloses(51, "2026-10-24", "over");
    const broke = endOfDayReport(over, "2026-10-24");
    const brokeOff = endOfDayReport(over, "2026-10-24", { rules: paceOff() });
    expect(broke.tradeCount).toBe(51);
    expect(broke.pnlUsd).toBeGreaterThan(0);
    expect(broke.score).toBeLessThan(100);
    expect(broke.score).toBeLessThan(brokeOff.score!);
    expect(broke.score).toBe((brokeOff.score ?? 0) - Math.round(8 + 40 / 51));
    expect(broke.lead).toMatch(/51 closed trades/);
    expect(broke.lead).toMatch(/The rule is 50/);
    expect(broke.lead).toContain(PACE_RULE_TEXT);
    expect(broke.why).toMatch(/broken base rule/);
    expect(broke.rational).toBe(false);
    expect(brokeOff.lead).not.toContain(PACE_RULE_TEXT);
    expect(brokeOff.why).not.toMatch(/broken base rule/);
  });

  it("does not count a UTC timestamp that is still the previous evening in New York", () => {
    const saturday = greenCloses(50, "2026-10-24", "sat");
    const fridayEvening = row("eve", "2026-10-23", 0, {
      at: "2026-10-24T03:30:00.000Z",
      pnl: 3,
      amount: 10,
      mc: 40_000,
      exitMc: 48_000,
      buys: 2,
    });
    const saturdayReport = endOfDayReport([fridayEvening, ...saturday], "2026-10-24");
    const fridayReport = endOfDayReport([fridayEvening, ...saturday], "2026-10-23");
    expect(saturdayReport.tradeCount).toBe(50);
    expect(saturdayReport.lead).not.toContain(PACE_RULE_TEXT);
    expect(saturdayReport.why).not.toMatch(/broken base rule/);
    expect(fridayReport.tradeCount).toBe(1);
    expect(fridayReport.lead).not.toMatch(/The rule is 50/);
  });
});

function paceOff() {
  return baseRules().map((rule) => (rule.id === PACE_RULE_ID ? { ...rule, active: false } : rule));
}

function greenCloses(count: number, day: string, prefix: string): RoundTrip[] {
  return Array.from({ length: count }, (_, minute) =>
    row(`${prefix}-${minute}`, day, minute, {
      pnl: 3,
      amount: 10,
      mc: 40_000,
      exitMc: 48_000,
      buys: 2,
      symbol: `${prefix}${minute}`,
    }),
  );
}

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
    exitMc?: number;
    ath?: number | null;
    symbol?: string;
    buys?: number;
    mint?: string;
    liquidity?: number;
    at?: string;
    exitMinute?: number;
    volumeDroppedAfter?: boolean;
    mcDroppedAfter?: boolean;
    averagedDown?: boolean;
  } = {},
): RoundTrip {
  const amount = extra.amount ?? 20;
  const pnl = extra.pnl ?? 0;
  const mc = extra.mc ?? 30_000;
  const at = extra.at ?? stamp(day, minute);
  const exitAt = extra.exitMinute != null ? stamp(day, extra.exitMinute) : at;
  return {
    id,
    mint: extra.mint ?? id,
    symbol: extra.symbol ?? id.toUpperCase(),
    name: extra.symbol ?? id,
    metas: ["other"],
    terminal: "wallet",
    entryAt: at,
    exitAt,
    entryMarketCapUsd: mc,
    exitMarketCapUsd: extra.exitMc ?? mc,
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
    volumeDroppedAfter: extra.volumeDroppedAfter,
    mcDroppedAfter: extra.mcDroppedAfter,
    averagedDown: extra.averagedDown,
  };
}
