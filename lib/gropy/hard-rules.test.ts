import { describe, expect, it } from "vitest";
import { armedLines, parseHardRules } from "@/lib/gropy/hard-rules";

describe("gropy hard rules", () => {
  it("ignores a switch that has no positive number", () => {
    const rules = parseHardRules(
      JSON.stringify({
        stopOn: true,
        stopPercent: "",
        takeProfitOn: true,
        takeProfitPercent: "40",
        maxSolOn: true,
        maxSol: "0",
        dailyLossOn: false,
        dailyLossSol: "2",
        extras: [{ id: "a", text: "Skip coins already above $80k.", active: true }],
      }),
    );
    expect(armedLines(rules)).toEqual([
      "Take profit: exit a copy 40% above its entry.",
      "Skip coins already above $80k.",
    ]);
  });

  it("drops a broken save", () => {
    expect(armedLines(parseHardRules("not json"))).toEqual([]);
  });
});
