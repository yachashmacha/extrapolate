import { describe, expect, it } from "vitest";
import { classifyMeta } from "@/lib/metas";
import { CSV_TEMPLATE, parseCsvBook } from "@/lib/ingest/csv";

describe("csv", () => {
  it("reads the template into a round trip", () => {
    const book = parseCsvBook(CSV_TEMPLATE, "bullx");
    expect(book.trades).toHaveLength(1);
    expect(book.trades[0].symbol).toBe("BONKO");
    expect(book.trades[0].pnlUsd).toBe(96);
    expect(book.trades[0].kols.map((kol) => kol.name)).toEqual(["Orangie", "Cented"]);
    expect(book.trades[0].terminal).toBe("bullx");
    expect(book.trades[0].metas).toEqual(["animal"]);
  });

  it("rejects a file without the required columns", () => {
    expect(() => parseCsvBook("symbol,pnl\nBONKO,1\n", "axiom")).toThrow(/Missing columns/);
  });
});

describe("meta classifier", () => {
  it("tags narratives from the name without catching fragments", () => {
    expect(classifyMeta("Trump Cat", "TCAT")).toEqual(["political", "animal"]);
    expect(classifyMeta("Catalyst", "CATA")).toEqual(["other"]);
    expect(classifyMeta("Loom Agent", "LOOM")).toEqual(["ai"]);
  });
});
