import { describe, expect, it } from "vitest";
import { parseRules } from "@/lib/rules";

describe("trading rules", () => {
  it("starts empty and ignores preset strings", () => {
    expect(parseRules(null)).toEqual([]);
    expect(parseRules("not json")).toEqual([]);
    expect(parseRules("[]")).toEqual([]);
    expect(parseRules(JSON.stringify(["Cap buys at $60k", "Preset $150"]))).toEqual([]);
  });

  it("keeps rules the trader wrote", () => {
    expect(
      parseRules(JSON.stringify([{ id: "r1", text: "  Next buy after red is $10  ", active: true }, { id: "r2", text: "One ticket per coin", active: false }])),
    ).toEqual([
      { id: "r1", text: "Next buy after red is $10", active: true },
      { id: "r2", text: "One ticket per coin", active: false },
    ]);
  });
});
