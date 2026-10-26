import { describe, expect, it } from "vitest";
import { EMPTY_HARD_RULES, type GropyHardRules } from "@/lib/gropy/hard-rules";
import { reasonsForSwitch, seatNotes, type SwitchFacts } from "@/lib/gropy/reasoning";

function change(patch: Partial<SwitchFacts> = {}): SwitchFacts {
  return {
    at: "2026-10-24T20:00:00.000Z",
    fromName: "orangie",
    toName: "absol",
    losses: 3,
    streak: 3,
    lost: 1.2,
    fromRealized: 0.4,
    toRealized: 2.5,
    trigger: "losses",
    lossCoins: ["PEPE", "BONK", "WIF"],
    buyCaps: [],
    ...patch,
  };
}

describe("gropy switch reasoning", () => {
  it("explains a third losing trade and who took the seat", () => {
    const lines = reasonsForSwitch(change(), "", EMPTY_HARD_RULES, "sol");
    expect(lines[0]).toContain("Left orangie after 3 losing trades while copied (PEPE, BONK, WIF)");
    expect(lines[0]).toContain("stops copying on the third");
    expect(lines.some((line) => line.startsWith("Your instruction"))).toBe(false);
    expect(lines.at(-1)).toContain("absol is copied next");
    expect(lines.join(" ")).not.toContain("in a row");
  });

  it("cites a saved instruction to leave after two losses in a row", () => {
    const lines = reasonsForSwitch(change(), "Leave after two losses in a row.", EMPTY_HARD_RULES, "sol");
    expect(lines.some((line) => line.includes("two losses in a row") && line.includes("last 3 closes were losses"))).toBe(true);
  });

  it("does not cite an in-a-row instruction when a win broke the streak", () => {
    const lines = reasonsForSwitch(change({ streak: 1 }), "Leave after two losses in a row.", EMPTY_HARD_RULES, "sol");
    expect(lines.some((line) => line.includes("Your instruction"))).toBe(false);
  });

  it("does not treat a size note as a reason to switch wallets", () => {
    const lines = reasonsForSwitch(change(), "Size down after two red copies.", EMPTY_HARD_RULES, "sol");
    expect(lines.some((line) => line.includes("Your instruction"))).toBe(false);
  });

  it("cites an extra hard rule and a daily loss the closes actually reached", () => {
    const rules: GropyHardRules = {
      ...EMPTY_HARD_RULES,
      dailyLossOn: true,
      dailyLossSol: "1",
      extras: [{ id: "1", text: "Fire the wallet after 1 loss.", active: true }],
    };
    const lines = reasonsForSwitch(change(), "", rules, "sol");
    expect(lines.some((line) => line.includes("Fire the wallet after 1 loss"))).toBe(true);
    expect(lines.some((line) => line.includes("daily loss rule") && line.includes("1.200 SOL") && line.includes("1.000 SOL"))).toBe(true);
  });

  it("leaves the daily loss off when the SOL lost is under the line", () => {
    const rules: GropyHardRules = { ...EMPTY_HARD_RULES, dailyLossOn: true, dailyLossSol: "2" };
    const lines = reasonsForSwitch(change({ lost: 0.4 }), "", rules, "sol");
    expect(lines.some((line) => line.includes("daily loss"))).toBe(false);
  });

  it("cites a market cap instruction only when a copied buy was over that line", () => {
    const over = reasonsForSwitch(
      change({ buyCaps: [{ coin: "PEPE", marketCapUsd: 80_000 }] }),
      "Only copy wallets buying under $50k.",
      EMPTY_HARD_RULES,
      "sol",
    );
    expect(over.some((line) => line.includes("PEPE was entered at $80,000") && line.includes("under $50,000"))).toBe(true);

    const under = reasonsForSwitch(
      change({ buyCaps: [{ coin: "PEPE", marketCapUsd: 20_000 }] }),
      "Only copy wallets buying under $50k.",
      EMPTY_HARD_RULES,
      "sol",
    );
    expect(under.some((line) => line.includes("market cap"))).toBe(false);

    const missing = reasonsForSwitch(change({ buyCaps: [] }), "Only copy wallets buying under $50k.", EMPTY_HARD_RULES, "sol");
    expect(missing.some((line) => line.includes("market cap"))).toBe(false);
  });

  it("says the seat stayed empty when nobody was ahead", () => {
    const lines = reasonsForSwitch(change({ toName: null, toRealized: null }), "", EMPTY_HARD_RULES, "sol");
    expect(lines.at(-1)).toContain("nobody else was copied");
  });

  it("explains a seat that ended because the verified result was no longer positive", () => {
    const lines = reasonsForSwitch(change({ trigger: "unprofitable", losses: 2, fromRealized: -0.2, toName: "absol", toRealized: 1 }), "", EMPTY_HARD_RULES, "sol");
    expect(lines[0]).toContain("no longer");
    expect(lines[0]).toContain("−0.2000 SOL");
  });

  it("says when the wallet being copied already meets a saved loss instruction", () => {
    const notes = seatNotes({ name: "absol", losses: 2, streak: 2, lost: 0.3 }, "Switch after two losses in a row.", EMPTY_HARD_RULES, "sol");
    expect(notes[0]).toContain("Still copying absol");
    expect(notes.some((line) => line.includes("two losses in a row") && line.includes("is met"))).toBe(true);
    expect(notes.join(" ")).not.toContain("Left absol");
  });
});
