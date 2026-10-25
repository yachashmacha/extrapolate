import { describe, expect, it } from "vitest";
import { fadeAfterEntry, fomoStatus, type TapeCandle } from "@/lib/analysis/fomo";

describe("fade after the entry", () => {
  const entry = Date.parse("2026-10-23T18:38:33.000Z");

  it("calls it a fade when volume and the close both drop after the fill, at any price", () => {
    const candles = tape(entry, [
      { min: -2, v: 1000, c: 0.5 },
      { min: 0, v: 5000, c: 1 },
      { min: 1, v: 3000, c: 0.9 },
      { min: 2, v: 2000, c: 0.8 },
      { min: 3, v: 1000, c: 0.7 },
    ]);
    expect(fadeAfterEntry(candles, entry)).toEqual({ volumeDroppedAfter: true, mcDroppedAfter: true });
    expect(fomoStatus({ volumeDroppedAfter: true, mcDroppedAfter: true })).toBe("yes");
  });

  it("does not call a rising post-entry tape a fade, even from a high price", () => {
    const candles = tape(entry, [
      { min: 0, v: 1000, c: 1 },
      { min: 1, v: 2000, c: 1.2 },
      { min: 2, v: 4000, c: 1.4 },
    ]);
    expect(fadeAfterEntry(candles, entry)).toEqual({ volumeDroppedAfter: false, mcDroppedAfter: false });
    expect(fomoStatus({ volumeDroppedAfter: false, mcDroppedAfter: false })).toBe("no");
  });

  it("refuses FOMO when volume drops but market cap keeps climbing", () => {
    const candles = tape(entry, [
      { min: 0, v: 5000, c: 1 },
      { min: 1, v: 3000, c: 1.1 },
      { min: 2, v: 1000, c: 1.3 },
    ]);
    expect(fadeAfterEntry(candles, entry)).toEqual({ volumeDroppedAfter: true, mcDroppedAfter: false });
    expect(fomoStatus({ volumeDroppedAfter: true, mcDroppedAfter: false })).toBe("no");
  });

  it("refuses FOMO when market cap drops but volume turns back up", () => {
    const candles = tape(entry, [
      { min: 0, v: 5000, c: 1 },
      { min: 1, v: 1000, c: 0.9 },
      { min: 2, v: 4000, c: 0.7 },
    ]);
    expect(fadeAfterEntry(candles, entry).volumeDroppedAfter).toBe(false);
    expect(fadeAfterEntry(candles, entry).mcDroppedAfter).toBe(true);
    expect(fomoStatus({ volumeDroppedAfter: false, mcDroppedAfter: true })).toBe("no");
  });

  it("leaves a short, gapped, or one-sided tape unread", () => {
    expect(fadeAfterEntry(tape(entry, [{ min: 0, v: 5000, c: 1 }, { min: 1, v: 1000, c: 0.8 }]), entry)).toEqual({});
    expect(fadeAfterEntry(tape(entry, [{ min: 1, v: 1000, c: 0.8 }, { min: 2, v: 500, c: 0.6 }]), entry)).toEqual({});
    const late = tape(entry, [
      { min: 0, v: 5000, c: 1 },
      { min: 11, v: 100, c: 0.2 },
      { min: 12, v: 50, c: 0.1 },
    ]);
    expect(fadeAfterEntry(late, entry)).toEqual({});
    expect(fomoStatus({ volumeDroppedAfter: true })).toBe("unknown");
    expect(fomoStatus({})).toBe("unknown");
  });

  it("still reads a fade across omitted minutes, and ignores the tape before the fill", () => {
    const candles = tape(entry, [
      { min: -5, v: 100, c: 2 },
      { min: -4, v: 80, c: 1.8 },
      { min: 0, v: 4000, c: 1 },
      { min: 1, v: 2500, c: 0.95 },
      { min: 4, v: 900, c: 0.7 },
    ]);
    expect(fadeAfterEntry(candles, entry)).toEqual({ volumeDroppedAfter: true, mcDroppedAfter: true });
  });

  it("does not treat a flat post-entry close or a flat volume as a drop", () => {
    const flatPrice = tape(entry, [
      { min: 0, v: 4000, c: 1 },
      { min: 1, v: 2000, c: 1 },
      { min: 2, v: 1000, c: 1 },
    ]);
    expect(fadeAfterEntry(flatPrice, entry)).toEqual({ volumeDroppedAfter: true, mcDroppedAfter: false });
    const flatVolume = tape(entry, [
      { min: 0, v: 2000, c: 1 },
      { min: 1, v: 2000, c: 0.8 },
      { min: 2, v: 2000, c: 0.6 },
    ]);
    expect(fadeAfterEntry(flatVolume, entry)).toEqual({ volumeDroppedAfter: false, mcDroppedAfter: true });
  });
});

function tape(entryMs: number, rows: { min: number; v: number; c: number }[]): TapeCandle[] {
  const open = Math.floor(entryMs / 60_000) * 60_000;
  return rows.map((row) => ({ t: open + row.min * 60_000, v: row.v, c: row.c }));
}
