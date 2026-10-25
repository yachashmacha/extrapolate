import { describe, expect, it } from "vitest";
import { kolFromSpec, kolLabel, searchKols, tagsFromHits, timingAgainstEntry, TRACKED_KOLS } from "@/lib/kols";

describe("tracked kols", () => {
  it("keeps every wallet and puts the wallet next to a repeated name", () => {
    expect(TRACKED_KOLS).toHaveLength(718);
    expect(new Set(TRACKED_KOLS.map((kol) => kol.wallet)).size).toBe(718);
    const orangie = TRACKED_KOLS.filter((kol) => kol.name.toLowerCase() === "orangie");
    expect(orangie.length).toBeGreaterThan(1);
    const labels = orangie.map((kol) => kolLabel(kol));
    expect(new Set(labels).size).toBe(orangie.length);
    for (const kol of orangie) {
      expect(kolLabel(kol)).toContain(kol.name);
      expect(kolLabel(kol)).toContain(kol.wallet.slice(0, 4));
      expect(kolLabel(kol)).toContain(kol.wallet.slice(-4));
    }
  });

  it("finds a wallet from a name or from the address", () => {
    const byName = searchKols("KayTheDoc", 5);
    expect(byName[0]?.name).toBe("KayTheDoc");
    expect(byName[0]?.wallet).toMatch(/^DYAn/);
    const byWallet = searchKols(byName[0].wallet.slice(0, 6), 5);
    expect(byWallet.some((kol) => kol.wallet === byName[0].wallet)).toBe(true);
  });

  it("binds a pasted wallet to that name and leaves a bare handle unnamed as a wallet", () => {
    const kay = TRACKED_KOLS.find((kol) => kol.name === "KayTheDoc");
    expect(kay).toBeTruthy();
    const tagged = kolFromSpec(`${kay?.wallet}:before`);
    expect(tagged.name).toBe("KayTheDoc");
    expect(tagged.wallet).toBe(kay?.wallet);
    expect(kolLabel(tagged)).toContain("KayTheDoc");
    expect(kolFromSpec("orangie:before")).toMatchObject({ id: "orangie", name: "Orangie" });
    expect(kolFromSpec("cented:with").name).toBe("Cented");
  });

  it("keeps two wallets with the same name on separate tags", () => {
    const orangie = TRACKED_KOLS.filter((kol) => kol.name.toLowerCase() === "orangie").slice(0, 2);
    expect(orangie).toHaveLength(2);
    const tags = tagsFromHits(
      [
        { wallet: orangie[0].wallet, name: orangie[0].name, boughtAt: "2026-10-24T20:00:00.000Z" },
        { wallet: orangie[1].wallet, name: orangie[1].name, boughtAt: "2026-10-24T22:00:00.000Z" },
      ],
      "2026-10-24T21:00:00.000Z",
    );
    expect(tags.map((tag) => tag.wallet)).toEqual([orangie[0].wallet, orangie[1].wallet]);
    expect(tags.map((tag) => tag.timing)).toEqual(["before", "after"]);
    expect(kolLabel(tags[0])).not.toBe(kolLabel(tags[1]));
  });

  it("places the buy before, with, or after the entry", () => {
    const entry = "2026-10-24T21:00:00.000Z";
    expect(timingAgainstEntry("2026-10-24T20:00:00.000Z", entry)).toBe("before");
    expect(timingAgainstEntry("2026-10-24T21:00:30.000Z", entry)).toBe("with");
    expect(timingAgainstEntry("2026-10-24T21:05:00.000Z", entry)).toBe("after");
  });
});
