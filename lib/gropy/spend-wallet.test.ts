import { describe, expect, it } from "vitest";
import { fundedCopies, parseSpendWallet } from "@/lib/gropy/spend-wallet";
import type { GropyCopyDraft } from "@/lib/gropy/view";

const drafts: GropyCopyDraft[] = [
  { trader: "Art", coin: "PEPE", boughtAt: "2026-10-24T15:00:00.000Z", sol: 0.8 },
  { trader: "Art", coin: "WIF", boughtAt: "2026-10-24T16:00:00.000Z", sol: 0.4 },
];

describe("gropy spend wallet", () => {
  it("sizes copies from the connected wallet and does not mark them sent", () => {
    const funded = fundedCopies(drafts, 1);
    expect(funded.map((row) => row.sol)).toEqual([0.8, 0.2]);
    expect(funded.every((row) => row.sent === false)).toBe(true);
    expect(fundedCopies(drafts, 0)).toEqual([]);
    expect(fundedCopies(drafts, null)).toEqual([]);
  });

  it("keeps a stored Phantom address and drops anything else", () => {
    const address = "EDuL8FE3ozisQxMUoteZQXJfuccZvTFdpntL8x7Ur8vV";
    expect(parseSpendWallet(JSON.stringify({ kind: "phantom", address }))).toEqual({ kind: "phantom", address });
    expect(parseSpendWallet(JSON.stringify({ kind: "ledger", address }))).toBeNull();
    expect(parseSpendWallet(JSON.stringify({ kind: "solflare", address: "secret-key" }))).toBeNull();
    expect(parseSpendWallet("not json")).toBeNull();
    expect(parseSpendWallet(null)).toBeNull();
  });
});
