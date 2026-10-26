import { describe, expect, it } from "vitest";
import { endOfDayReport, narrativeNudge } from "@/lib/analysis/day-report";
import { narrativeScore } from "@/lib/analysis/narrative";
import { kolFromSpec, makeKol, tagsFromHits, TRACKED_KOLS } from "@/lib/kols";
import type { KolTag, MetaId, RoundTrip } from "@/lib/types";

const WALLET = "3sMvbeAJC9gQvgapgo3FjavtswRh55LE2G98qLxjaAsv";

describe("narrative score", () => {
  const priors = [0, 1, 2].map((index) =>
    trade(`dog-${index}`, {
      mint: `dog-mint-${index}`,
      symbol: `DOG${index}`,
      metas: ["animal"],
      pnl: 100,
      entryAt: `2026-10-0${index + 1}T15:00:00.000Z`,
      exitAt: `2026-10-0${index + 1}T18:00:00.000Z`,
    }),
  );

  const strong = trade("strong", {
    mint: "strong-mint",
    symbol: "HOUND",
    metas: ["animal"],
    pnl: 40,
    entryAt: "2026-10-20T15:00:00.000Z",
    exitAt: "2026-10-20T16:00:00.000Z",
    kols: [makeKol("orangie", "before"), makeKol("cented", "before")],
    mc: 40_000,
    ath: 400_000,
    amount: 25,
    volumeDroppedAfter: true,
    mcDroppedAfter: true,
  });

  const weak = trade("weak", {
    mint: "weak-mint",
    symbol: "VOTE",
    metas: ["political"],
    pnl: -10,
    entryAt: "2026-10-20T17:00:00.000Z",
    exitAt: "2026-10-20T18:00:00.000Z",
    mc: 40_000,
    ath: null,
    amount: 25,
  });

  const book = [...priors, strong, weak];

  it("scores prior winners and callers in before above a coin with no callers, no comps, and no run", () => {
    const high = narrativeScore(strong, book);
    const low = narrativeScore(weak, book);

    expect(high.score).toBeGreaterThan(low.score);
    expect(Number.isInteger(high.score)).toBe(true);
    expect(Number.isInteger(low.score)).toBe(true);
    expect(high.score).toBeGreaterThanOrEqual(1);
    expect(high.score).toBeLessThanOrEqual(10);
    expect(low.score).toBeGreaterThanOrEqual(1);
    expect(low.score).toBeLessThanOrEqual(10);
    expect(high.factors.length).toBeGreaterThan(0);
    expect(high.factors.length).toBeLessThanOrEqual(2);
    expect(high.line).toMatch(/Orangie/);
    expect(high.line).toMatch(/Cented/);
    expect(high.line).toMatch(/before the entry/);
    expect(high.line).toMatch(/Animals is 3 of 3 in this book, up \$300/);
    expect(low.line).toMatch(/No earlier Politics coin in this book/);
    expect(low.line).not.toMatch(/Ran to/);
    expect(high.line).not.toMatch(/fomo/i);
    expect(low.line).not.toMatch(/fomo/i);
    expect(high.line).not.toMatch(/percent of the coin|of the pool/i);
    expect(`${high.line} ${low.line}`).not.toMatch(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  });

  it("does not treat a missing caller as a zero when the coin ran and the narrative has paid", () => {
    const noCaller = trade("nocall", {
      mint: "nocall-mint",
      symbol: "PUP",
      metas: ["animal"],
      pnl: 20,
      entryAt: "2026-10-21T15:00:00.000Z",
      exitAt: "2026-10-21T16:00:00.000Z",
      mc: 30_000,
      ath: 300_000,
    });
    const scored = narrativeScore(noCaller, [...priors, noCaller]);
    expect(scored.score).toBeGreaterThan(narrativeScore(weak, book).score);
    expect(scored.line).toMatch(/Animals is 3 of 3/);
    expect(scored.line).toMatch(/Ran to/);
    expect(scored.line).not.toMatch(/fomo/i);
  });

  it("weighs a caller in before more than the same caller after, and ignores ticket size", () => {
    const before = narrativeScore(trade("early-caller", { kols: [makeKol("orangie", "before")], ath: null }), [strong]);
    const after = narrativeScore(trade("late-caller", { kols: [makeKol("orangie", "after")], ath: null }), [strong]);
    expect(before.score).toBeGreaterThan(after.score);
    expect(before.line).toMatch(/in before the entry/);
    expect(after.line).toMatch(/showed up after the entry/);

    const small = narrativeScore(strong, book);
    const huge = narrativeScore({ ...strong, amountUsd: 25_000 }, book);
    const thinPool = narrativeScore({ ...strong, liquidityUsd: 400 }, book);
    const deepPool = narrativeScore({ ...strong, liquidityUsd: 2_000_000 }, book);
    expect(huge.score).toBe(small.score);
    expect(huge.line).toBe(small.line);
    expect(thinPool.score).toBe(small.score);
    expect(deepPool.score).toBe(small.score);
    expect(thinPool.line).toBe(small.line);
    expect(`${thinPool.line} ${deepPool.line}`).not.toMatch(/percent of the coin|of the pool|% of supply/i);
  });

  it("skips the run when the high was not stored, and keeps a fade from being relabeled", () => {
    const quiet = narrativeScore({ ...strong, athMarketCapUsd: undefined }, book);
    expect(quiet.line).not.toMatch(/Ran to|early in the range|extended/);
    const faded = narrativeScore(strong, book);
    const calm = narrativeScore({ ...strong, volumeDroppedAfter: false, mcDroppedAfter: false }, book);
    expect(faded.score).toBe(calm.score);
    expect(faded.line).toBe(calm.line);
    expect(faded.line).not.toMatch(/fomo/i);
  });

  it("counts independent callers and shows the name without the wallet", () => {
    const orangie = TRACKED_KOLS.filter((kol) => kol.name.toLowerCase() === "orangie").slice(0, 2);
    expect(orangie).toHaveLength(2);
    const entryAt = "2026-10-24T21:00:00.000Z";
    const both = tagsFromHits(
      orangie.map((kol) => ({ wallet: kol.wallet, name: kol.name, boughtAt: "2026-10-24T20:00:00.000Z" })),
      entryAt,
    );
    const one = narrativeScore(trade("one-orangie", { kols: [both[0]], entryAt, ath: null, metas: ["other"] }), []);
    const two = narrativeScore(trade("two-orangie", { kols: both, entryAt, ath: null, metas: ["other"] }), []);
    expect(two.score).toBeGreaterThan(one.score);
    expect(two.line).toMatch(/orangie/i);
    expect(two.line).toMatch(/2 callers/);
    expect(two.line).not.toContain(orangie[0].wallet);
    expect(two.line).not.toContain(orangie[1].wallet);
    expect(two.line).not.toContain(orangie[0].wallet.slice(0, 4));

    const pasted = narrativeScore(
      trade("pasted", { kols: [kolFromSpec(`${WALLET}:before`)], ath: null, metas: ["food"] }),
      [],
    );
    expect(pasted.line).not.toContain(WALLET);
    expect(pasted.line).not.toContain(WALLET.slice(0, 4));
    expect(pasted.line).toMatch(/caller/i);
    expect(pasted.line).not.toMatch(/\d of \d|finished up|finished down/);
  });

  it("keeps the tag when one earlier coin is only a small part of the score", () => {
    const prior = trade("prior-dog", {
      metas: ["animal"],
      pnl: -8.22,
      entryAt: "2026-10-01T12:00:00.000Z",
      exitAt: "2026-10-01T13:00:00.000Z",
      ath: null,
    });
    const coin = trade("later", {
      metas: ["animal"],
      pnl: -1,
      entryAt: "2026-10-20T12:00:00.000Z",
      ath: null,
    });
    const scored = narrativeScore(coin, [prior, coin]);
    expect(scored.score).toBeGreaterThan(0);
    expect(scored.line).toMatch(/The narrative is Animals/);
    expect(scored.line).toMatch(/earlier Animals coin in this book finished down/);
  });

  it("names three callers and counts the rest", () => {
    const kols = ["art", "beanz", "cupsey", "decu", "flames", "cented"].map((name) => makeKol(name, "before"));
    const line = narrativeScore(trade("crowd", { kols, ath: null, metas: ["ai"] }), []).line;
    expect(line).toMatch(/Art, Beanz, Cupsey, and 3 more were in before the entry/);
    expect(line).not.toMatch(/Decu|Flames|Cented/);
    expect(line).toMatch(/The narrative is AI/);
  });

  it("shows a 1–10 coin score on the best line and leaves an ordinary green day at 100 percent", () => {
    const day = [0, 1, 2, 3].map((minute) =>
      trade(`green-${minute}`, {
        pnl: 8,
        amount: 20,
        mc: 30_000,
        exitMc: 40_000,
        ath: 100_000,
        entryAt: stamp("2026-10-24", minute),
        exitAt: stamp("2026-10-24", minute),
        metas: ["other"],
      }),
    );
    const report = endOfDayReport(day, "2026-10-24");
    expect(report.score).toBe(100);
    expect(report.why).not.toMatch(/narrative score/i);
    for (const fill of [...report.best, ...report.worst]) {
      expect(Number.isInteger(fill.narrativeScore)).toBe(true);
      expect(fill.narrativeScore).toBeGreaterThanOrEqual(1);
      expect(fill.narrativeScore).toBeLessThanOrEqual(10);
      expect(fill.narrative.length).toBeGreaterThan(0);
      expect(fill.narrative).not.toMatch(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
    }
    expect(report.best.length).toBeGreaterThan(0);
  });

  it("nudges a red day up a few points for stronger narratives and still stays under 100", () => {
    const priors = [0, 1, 2].map((index) =>
      trade(`prior-${index}`, {
        mint: `prior-mint-${index}`,
        metas: ["animal"],
        pnl: 80,
        amount: 20,
        entryAt: `2026-10-0${index + 1}T12:00:00.000Z`,
        exitAt: `2026-10-0${index + 1}T13:00:00.000Z`,
        ath: null,
      }),
    );
    const highDay = [0, 1, 2, 3].map((minute) =>
      trade(`high-${minute}`, {
        mint: `high-mint-${minute}`,
        metas: ["animal"],
        pnl: -5,
        amount: 20,
        mc: 40_000,
        ath: 400_000,
        kols: [makeKol("orangie", "before"), makeKol("cented", "before")],
        entryAt: stamp("2026-10-24", minute),
        exitAt: stamp("2026-10-24", minute),
      }),
    );
    const lowDay = [0, 1, 2, 3].map((minute) =>
      trade(`low-${minute}`, {
        mint: `low-mint-${minute}`,
        metas: ["political"],
        pnl: -5,
        amount: 20,
        mc: 40_000,
        ath: null,
        entryAt: stamp("2026-10-24", minute),
        exitAt: stamp("2026-10-24", minute),
      }),
    );
    const high = endOfDayReport([...priors, ...highDay], "2026-10-24");
    const low = endOfDayReport(lowDay, "2026-10-24");
    expect(high.pnlUsd).toBe(low.pnlUsd);
    expect(high.pnlUsd).toBeLessThan(0);
    expect(high.biases.map((bias) => bias.title)).toEqual(low.biases.map((bias) => bias.title));
    expect(high.score).toBeGreaterThan(low.score!);
    expect(high.score! - low.score!).toBeLessThanOrEqual(6);
    expect(high.score! - low.score!).toBeGreaterThanOrEqual(1);
    expect(high.score).toBeLessThan(100);
    expect(low.score).toBeLessThan(100);
    expect(high.worst.every((fill) => fill.narrativeScore >= 1 && fill.narrativeScore <= 10)).toBe(true);
    expect(Math.min(...high.worst.map((fill) => fill.narrativeScore))).toBeGreaterThan(
      Math.max(...low.worst.map((fill) => fill.narrativeScore)),
    );
  });

  it("keeps a green day under 100 when a bias showed or a base rule broke, even if the coins score high", () => {
    const faded = [0, 1, 2, 3].map((minute) =>
      trade(`fade-${minute}`, {
        mint: `fade-mint-${minute}`,
        metas: ["animal"],
        pnl: 20,
        amount: 20,
        mc: 40_000,
        ath: 400_000,
        kols: [makeKol("orangie", "before"), makeKol("cented", "before")],
        volumeDroppedAfter: true,
        mcDroppedAfter: true,
        entryAt: stamp("2026-10-24", minute),
        exitAt: stamp("2026-10-24", minute),
      }),
    );
    const chased = endOfDayReport(faded, "2026-10-24");
    expect(chased.pnlUsd).toBeGreaterThan(0);
    expect(chased.score).toBeLessThan(100);
    expect(chased.score).toBeLessThan(70);

    const broken = [0, 1, 2, 3].map((minute) =>
      trade(`rule-${minute}`, {
        mint: `rule-mint-${minute}`,
        metas: ["animal"],
        pnl: 12,
        amount: 20,
        mc: 40_000,
        exitMc: minute === 0 ? 10_000 : 50_000,
        ath: 400_000,
        kols: [makeKol("orangie", "before"), makeKol("cented", "before")],
        entryAt: stamp("2026-10-24", minute + 10),
        exitAt: stamp("2026-10-24", minute + 10),
      }),
    );
    const ruled = endOfDayReport(broken, "2026-10-24", { accountUsd: 10_000 });
    expect(ruled.pnlUsd).toBeGreaterThan(0);
    expect(ruled.score).toBeLessThan(100);
    expect(ruled.why).toMatch(/broken base rule/);
    expect(ruled.best.some((fill) => fill.narrativeScore >= 7)).toBe(true);
  });

  it("does not let one strong coin, or a day of 10s, lift a biased or red day to 100", () => {
    expect(narrativeNudge([10, 10, 10, 10])).toBeLessThanOrEqual(3);
    expect(narrativeNudge([10, 10, 10, 10])).toBeGreaterThan(0);
    expect(narrativeNudge([1, 1, 1, 1])).toBeGreaterThanOrEqual(-3);
    expect(narrativeNudge([1, 1, 1, 1])).toBeLessThan(0);
    expect(narrativeNudge([10, 10, 10, 10]) - narrativeNudge([1, 1, 1, 1])).toBeLessThanOrEqual(6);
    expect(Math.abs(narrativeNudge([10, 1, 1, 1]) - narrativeNudge([1, 1, 1, 1]))).toBeLessThanOrEqual(1);

    const weak = [0, 1, 2, 3].map((minute) =>
      trade(`again-${minute}`, {
        mint: "same-mint",
        symbol: "AGAIN",
        metas: ["political"],
        pnl: -12,
        amount: 20,
        ath: null,
        entryAt: stamp("2026-10-24", minute),
        exitAt: stamp("2026-10-24", minute),
      }),
    );
    const rescued = weak.map((row, index) =>
      index === 0
        ? {
            ...row,
            kols: [makeKol("orangie", "before"), makeKol("cented", "before"), makeKol("ansem", "before")],
            athMarketCapUsd: 400_000,
            entryMarketCapUsd: 20_000,
            metas: ["animal"] as MetaId[],
          }
        : row,
    );
    const plain = endOfDayReport(weak, "2026-10-24");
    const mixed = endOfDayReport(rescued, "2026-10-24");
    expect(plain.biases.map((bias) => bias.title)).toContain("Break-even chase");
    expect(mixed.biases.map((bias) => bias.title)).toContain("Break-even chase");
    expect(plain.score).toBeLessThan(50);
    expect(mixed.score).toBeLessThan(50);
    expect(mixed.score! - plain.score!).toBeLessThanOrEqual(2);
    expect(mixed.score).toBeLessThan(100);
  });
});

function stamp(day: string, minute: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date, 16, minute, 0)).toISOString();
}

function trade(
  id: string,
  extra: {
    mint?: string;
    symbol?: string;
    metas?: MetaId[];
    pnl?: number;
    amount?: number;
    mc?: number;
    exitMc?: number;
    ath?: number | null;
    entryAt?: string;
    exitAt?: string;
    kols?: KolTag[];
    volumeDroppedAfter?: boolean;
    mcDroppedAfter?: boolean;
  } = {},
): RoundTrip {
  const amount = extra.amount ?? 20;
  const pnl = extra.pnl ?? 0;
  const mc = extra.mc ?? 30_000;
  const entryAt = extra.entryAt ?? "2026-10-20T15:00:00.000Z";
  return {
    id,
    mint: extra.mint ?? id,
    symbol: extra.symbol ?? id.toUpperCase(),
    name: extra.symbol ?? id,
    metas: extra.metas ?? ["animal"],
    terminal: "wallet",
    entryAt,
    exitAt: extra.exitAt ?? entryAt,
    entryMarketCapUsd: mc,
    exitMarketCapUsd: extra.exitMc ?? mc,
    liquidityUsd: 100_000,
    amountUsd: amount,
    pnlUsd: pnl,
    pnlPct: amount > 0 ? (pnl / amount) * 100 : 0,
    holdMinutes: 5,
    kols: extra.kols ?? [],
    minutesFromLaunch: -1,
    buys: 1,
    sells: 1,
    athMarketCapUsd: extra.ath === null ? undefined : (extra.ath ?? 100_000),
    volumeDroppedAfter: extra.volumeDroppedAfter,
    mcDroppedAfter: extra.mcDroppedAfter,
  };
}
