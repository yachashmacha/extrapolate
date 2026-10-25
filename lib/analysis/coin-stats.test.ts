import { describe, expect, it } from "vitest";
import {
  applyVerifiedTape,
  coinStatsFromTape,
  copyVerifiedTape,
  describeVerifiedTape,
  highSinceEntry,
  tapeForMint,
  verifiedTape,
  type PoolCandle,
} from "@/lib/analysis/coin-stats";
import { narrativeScore } from "@/lib/analysis/narrative";
import { fmtCoin } from "@/lib/format";
import type { RoundTrip } from "@/lib/types";

const SUPPLY = 1_000_047_198.538368;
const DAY = 86_400_000;
const FIRST_T = Date.parse("2026-10-23T00:00:00.000Z");
const LAST_T = Date.parse("2026-10-25T00:00:00.000Z");
const FIRST_CLOSE = 0.00000731844780574574;
const LAST_CLOSE = 0.000006562671040774099;
const HIGH = 0.00002016420672118127;
const VOLUME_A = 63666.93;
const VOLUME_B = 1075.4;

const life: PoolCandle[] = [
  { t: LAST_T, v: VOLUME_B, c: LAST_CLOSE, h: 0.000007723770670735752 },
  { t: FIRST_T, v: VOLUME_A, c: FIRST_CLOSE, h: HIGH },
];

function dollars(value: number): number {
  return Math.round(value * 100) / 100;
}

describe("verified coin tape", () => {
  it("does not fabricate volume, a price path, market cap, or FOMO when the tape and the high are missing", () => {
    const stats = coinStatsFromTape({
      life: null,
      supply: null,
      entryPrice: null,
      exitPrice: null,
      entryMs: FIRST_T,
      postEntry: [],
    });
    expect(stats.volumeUsd).toBeNull();
    expect(stats.pricePath).toBeNull();
    expect(stats.highMarketCapUsd).toBeNull();
    expect(stats.firstMarketCapUsd).toBeNull();
    expect(stats.lastMarketCapUsd).toBeNull();
    expect(stats.entryMarketCapUsd).toBeNull();
    expect(stats.exitMarketCapUsd).toBeNull();
    expect(stats.volumeDroppedAfter).toBeUndefined();
    expect(stats.mcDroppedAfter).toBeUndefined();
    expect(stats.fomo).toBe("unknown");
    expect(stats.candleCount).toBe(0);
    expect(verifiedTape(stats)).toBeNull();
    expect(describeVerifiedTape({})).toBeNull();

    const kept = applyVerifiedTape(trade({ athMarketCapUsd: undefined }), null);
    expect(kept.lifeVolumeUsd).toBeUndefined();
    expect(kept.athMarketCapUsd).toBeUndefined();
    expect(kept.poolCloseFromUsd).toBeUndefined();
  });

  it("uses the fetched series as itself, not a nearby story number", () => {
    const entryPrice = 0.000011796;
    const exitPrice = 0.000014254;
    const stats = coinStatsFromTape({
      life,
      supply: SUPPLY,
      entryPrice,
      exitPrice,
      windowCapped: false,
    });
    expect(stats.volumeUsd).toBe(VOLUME_A + VOLUME_B);
    expect(stats.volumeUsd).not.toBe(76_500);
    expect(stats.volumeUsd).not.toBe(1_200);
    expect(stats.pricePath).toEqual({
      first: FIRST_CLOSE,
      last: LAST_CLOSE,
      fromMs: FIRST_T,
      toMs: LAST_T,
    });
    expect(stats.highMarketCapUsd).toBe(dollars(HIGH * SUPPLY));
    expect(stats.highMarketCapUsd).not.toBe(20_000);
    expect(stats.firstMarketCapUsd).toBe(dollars(FIRST_CLOSE * SUPPLY));
    expect(stats.lastMarketCapUsd).toBe(dollars(LAST_CLOSE * SUPPLY));
    expect(stats.entryMarketCapUsd).toBe(dollars(entryPrice * SUPPLY));
    expect(stats.exitMarketCapUsd).toBe(dollars(exitPrice * SUPPLY));
    expect(stats.fomo).toBe("unknown");

    const tape = verifiedTape(stats);
    const shown = applyVerifiedTape(trade(), tape);
    const line = describeVerifiedTape(shown);
    expect(line).toBe(
      `Volume ${fmtCoin(VOLUME_A + VOLUME_B)} across 2 daily candles, Oct 23, 2026–Oct 25, 2026. Pool close went from ${fmtCoin(stats.firstMarketCapUsd ?? 0)} to ${fmtCoin(stats.lastMarketCapUsd ?? 0)} on those candles.`,
    );
    expect(line).not.toMatch(/76,500|1,200|\$20k|whole life|throughout its life/i);
  });

  it("labels one daily candle as that day and does not turn it into a life path", () => {
    const stats = coinStatsFromTape({
      life: [{ t: FIRST_T, v: VOLUME_A, c: FIRST_CLOSE, h: HIGH }],
      supply: SUPPLY,
    });
    expect(stats.volumeUsd).toBe(VOLUME_A);
    expect(stats.pricePath).toBeNull();
    expect(stats.lastMarketCapUsd).toBeNull();
    expect(stats.highMarketCapUsd).toBe(dollars(HIGH * SUPPLY));
    const line = describeVerifiedTape(applyVerifiedTape(trade(), verifiedTape(stats)));
    expect(line).toBe(`Volume ${fmtCoin(VOLUME_A)} on the daily candle Oct 23, 2026.`);
    expect(line).not.toMatch(/went from|whole life|throughout its life/i);
  });

  it("does not invent a high or a market cap from the close when supply or the high was not fetched", () => {
    const stats = coinStatsFromTape({
      life: [
        { t: FIRST_T, v: VOLUME_A, c: FIRST_CLOSE },
        { t: LAST_T, v: VOLUME_B, c: LAST_CLOSE },
      ],
      supply: null,
      entryPrice: 0.000011796,
    });
    expect(stats.volumeUsd).toBe(VOLUME_A + VOLUME_B);
    expect(stats.pricePath?.first).toBe(FIRST_CLOSE);
    expect(stats.pricePath?.last).toBe(LAST_CLOSE);
    expect(stats.highMarketCapUsd).toBeNull();
    expect(stats.firstMarketCapUsd).toBeNull();
    expect(stats.entryMarketCapUsd).toBeNull();
    const shown = applyVerifiedTape(trade({ athMarketCapUsd: 20_000 }), verifiedTape(stats));
    expect(shown.athMarketCapUsd).toBeUndefined();
    expect(shown.lifeVolumeUsd).toBe(VOLUME_A + VOLUME_B);
    expect(describeVerifiedTape(shown)).not.toMatch(/went from|\$20/);
  });

  it("does not copy one mint's tape onto another, or the post-entry window onto the life volume", () => {
    const entry = Date.parse("2026-10-23T18:38:33.000Z");
    const open = Math.floor(entry / 60_000) * 60_000;
    const postEntry: PoolCandle[] = [
      { t: open, v: 5000, c: 1, h: 1.1 },
      { t: open + 60_000, v: 3000, c: 0.9 },
      { t: open + 120_000, v: 1000, c: 0.7 },
    ];
    const faded = coinStatsFromTape({ life: null, supply: SUPPLY, entryMs: entry, postEntry });
    expect(faded.volumeUsd).toBeNull();
    expect(faded.pricePath).toBeNull();
    expect(faded.highMarketCapUsd).toBeNull();
    expect(faded.fomo).toBe("yes");
    expect(faded.volumeDroppedAfter).toBe(true);
    expect(faded.mcDroppedAfter).toBe(true);

    const rising = coinStatsFromTape({
      life: null,
      entryMs: entry,
      postEntry: [
        { t: open, v: 1000, c: 1 },
        { t: open + 60_000, v: 2000, c: 1.2 },
        { t: open + 120_000, v: 4000, c: 1.4 },
      ],
    });
    expect(rising.fomo).toBe("no");
    expect(rising.volumeUsd).toBeNull();

    const half = coinStatsFromTape({
      life: null,
      entryMs: entry,
      postEntry: [
        { t: open, v: 5000, c: 1 },
        { t: open + 60_000, v: 1000, c: 1.3 },
        { t: open + 120_000, v: 800, c: 1.5 },
      ],
    });
    expect(half.fomo).toBe("no");

    const own = verifiedTape(coinStatsFromTape({ life, supply: SUPPLY }))!;
    const tapes = { mintA: own };
    expect(tapeForMint(tapes, "mintB")).toBeNull();
    expect(tapeForMint(tapes, "mintA")?.volumeUsd).toBe(VOLUME_A + VOLUME_B);
    const other = applyVerifiedTape(trade({ mint: "mintB", athMarketCapUsd: 99 }), undefined);
    expect(other.lifeVolumeUsd).toBeUndefined();
    expect(copyVerifiedTape(trade({ mint: "mintB" }), { ...trade({ mint: "mintA" }), lifeVolumeUsd: VOLUME_A + VOLUME_B, lifeCandleCount: 2, lifeFromMs: FIRST_T, lifeToMs: LAST_T })).toEqual(
      trade({ mint: "mintB" }),
    );
  });

  it("says the window is partial when the read hit the page cap", () => {
    const capped = life.map((candle, index) => ({ ...candle, t: FIRST_T + index * DAY }));
    const stats = coinStatsFromTape({ life: capped, supply: SUPPLY, windowCapped: true });
    const line = describeVerifiedTape(applyVerifiedTape(trade(), verifiedTape(stats)));
    expect(line).toMatch(/latest 2 daily candles/);
    expect(line).not.toMatch(/whole life|throughout its life/i);
    expect(stats.volumeUsd).toBe(VOLUME_A + VOLUME_B);
  });

  it("does not call a high from before the entry what the coin ran to", () => {
    const stats = coinStatsFromTape({ life, supply: SUPPLY });
    const tape = verifiedTape(stats);
    const earlyHigh = dollars(HIGH * SUPPLY);
    const laterHigh = dollars(0.000007723770670735752 * SUPPLY);
    expect(stats.highMarketCapUsd).toBe(earlyHigh);
    expect(highSinceEntry(tape?.bars, LAST_T + 3_600_000)).toBe(laterHigh);
    const boughtLater = applyVerifiedTape(
      trade({
        entryAt: new Date(LAST_T + 3_600_000).toISOString(),
        entryMarketCapUsd: laterHigh / 8,
        athMarketCapUsd: earlyHigh,
      }),
      tape,
    );
    expect(boughtLater.athMarketCapUsd).toBe(laterHigh);
    expect(boughtLater.athMarketCapUsd).not.toBe(earlyHigh);
    const line = narrativeScore(boughtLater, [boughtLater]).line;
    const laterRan = `Ran to ${fmtCoin(laterHigh)}`;
    const earlyRan = `Ran to ${fmtCoin(earlyHigh)}`;
    expect(line).not.toContain(earlyRan);
    expect(line).not.toContain(fmtCoin(earlyHigh));
    expect(line).toContain(laterRan);

    const afterTheTape = applyVerifiedTape(
      trade({
        entryAt: new Date(LAST_T + 2 * DAY).toISOString(),
        athMarketCapUsd: earlyHigh,
        entryMarketCapUsd: 5_000,
      }),
      tape,
    );
    expect(afterTheTape.athMarketCapUsd).toBeUndefined();
    expect(narrativeScore(afterTheTape, [afterTheTape]).line).not.toMatch(/Ran to/);
  });
});

function trade(patch: Partial<RoundTrip> = {}): RoundTrip {
  return {
    id: "id",
    mint: patch.mint ?? "mintA",
    symbol: "ZIP",
    name: "Zip",
    metas: ["other"],
    terminal: "wallet",
    entryAt: new Date(FIRST_T).toISOString(),
    exitAt: new Date(LAST_T).toISOString(),
    entryMarketCapUsd: 0,
    exitMarketCapUsd: 0,
    liquidityUsd: 0,
    amountUsd: 10,
    pnlUsd: 1,
    pnlPct: 10,
    holdMinutes: 5,
    kols: [],
    minutesFromLaunch: -1,
    buys: 1,
    sells: 1,
    ...patch,
  };
}
