import { describe, expect, it } from "vitest";
import {
  bondZone,
  fomoStatus,
  graduationMarketCapUsd,
  GRADUATION_MCAP_SOL,
  volumeFallingAt,
  type VolumeCandle,
} from "@/lib/analysis/fomo";

describe("bond position", () => {
  it("places graduation near 411 SOL, not a fixed $69k", () => {
    expect(GRADUATION_MCAP_SOL).toBeGreaterThan(410);
    expect(GRADUATION_MCAP_SOL).toBeLessThan(412);
    const atHundred = graduationMarketCapUsd(100);
    expect(atHundred).toBe(Math.round(GRADUATION_MCAP_SOL * 100));
    expect(atHundred).toBeGreaterThan(40_000);
    expect(atHundred).toBeLessThan(42_000);
  });

  it("calls a fill close to the bond only in the last slice of the curve", () => {
    const graduation = 43_000;
    expect(bondZone({ entryMarketCapUsd: 40_000, graduationMarketCapUsd: graduation })).toBe("close");
    expect(bondZone({ entryMarketCapUsd: 36_000, graduationMarketCapUsd: graduation })).toBe("below");
    expect(bondZone({ entryMarketCapUsd: 90_000, graduationMarketCapUsd: graduation })).toBe("post");
    expect(bondZone({ entryMarketCapUsd: 90_000 })).toBe("unknown");
  });

  it("refuses FOMO from the high alone, from a rising tape, or from a missing read", () => {
    const graduation = 43_000;
    expect(
      fomoStatus({ entryMarketCapUsd: 40_000, graduationMarketCapUsd: graduation, volumeFalling: true }),
    ).toBe("yes");
    expect(
      fomoStatus({ entryMarketCapUsd: 80_000, graduationMarketCapUsd: graduation, volumeFalling: false }),
    ).toBe("no");
    expect(fomoStatus({ entryMarketCapUsd: 80_000, graduationMarketCapUsd: graduation })).toBe("unknown");
    expect(fomoStatus({ entryMarketCapUsd: 20_000, graduationMarketCapUsd: graduation, volumeFalling: true })).toBe("no");
    expect(fomoStatus({ entryMarketCapUsd: 90_000, volumeFalling: true })).toBe("unknown");
  });
});

describe("volume at the fill", () => {
  const entry = Date.parse("2026-10-23T18:38:00.000Z");

  it("reads a fade only when the five minutes into the buy are well under the five before", () => {
    const fading = minutes(entry, [3000, 2800, 2600, 2400, 2200, 800, 700, 600, 500, 400]);
    expect(volumeFallingAt(fading, entry)).toBe(true);
    const rising = minutes(entry, [400, 500, 600, 700, 800, 2200, 2400, 2600, 2800, 3000]);
    expect(volumeFallingAt(rising, entry)).toBe(false);
  });

  it("does not call a quiet tape or a gap a fade", () => {
    const quiet = minutes(entry, [100, 90, 80, 70, 60, 20, 10, 10, 10, 10]);
    expect(volumeFallingAt(quiet, entry)).toBe(false);
    const gapped = minutes(entry, [3000, 2800, 2600, 2400, 2200, 2000, 1800, 800, 700, 600, 500, 400]).filter(
      (_, index) => index !== 8,
    );
    expect(volumeFallingAt(gapped, entry)).toBeUndefined();
    expect(volumeFallingAt(minutes(entry, [1000]), entry)).toBeUndefined();
  });
});

function minutes(entryMs: number, volumes: number[]): VolumeCandle[] {
  const start = entryMs - volumes.length * 60_000;
  return volumes.map((v, index) => ({ t: start + index * 60_000, v }));
}
