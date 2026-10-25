import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sizeCopies } from "@/lib/gropy/spend";
import { loadBotWallet, readSolBalance } from "@/lib/gropy/wallet";

describe("gropy bot wallet", () => {
  it("keeps the secret path gitignored", () => {
    const ignored = execFileSync("git", ["check-ignore", ".gropy-wallet.json"], { cwd: process.cwd(), encoding: "utf8" }).trim();
    expect(ignored).toBe(".gropy-wallet.json");
    expect(readFileSync(".gitignore", "utf8")).toMatch(/^\.gropy-wallet\.json$/m);
  });

  it("returns the same public address across reads and does not return the secret", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "gropy-wallet-")), ".gropy-wallet.json");
    const first = loadBotWallet(file);
    const second = loadBotWallet(file);
    expect(first.publicKey).toBe(second.publicKey);
    expect(first.publicKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(Object.keys(first)).toEqual(["publicKey"]);
    const saved = JSON.parse(readFileSync(file, "utf8")) as { publicKey: string; secretKey: number[] };
    expect(saved.publicKey).toBe(first.publicKey);
    expect(saved.secretKey).toHaveLength(64);
  });

  it("does not spend when the balance is zero or unread", async () => {
    const copies = [
      { id: "a", sol: 1 },
      { id: "b", sol: 0.4 },
    ];
    const empty = sizeCopies(copies, 0);
    expect(empty.spentSol).toBe(0);
    expect(empty.rows.every((row) => row.sent === false && row.sol == null)).toBe(true);

    const unread = sizeCopies(copies, null);
    expect(unread.spentSol).toBe(0);
    expect(unread.rows.every((row) => row.sent === false)).toBe(true);

    const capped = sizeCopies(copies, 0.2);
    expect(capped.spentSol).toBeLessThanOrEqual(0.2);
    expect(capped.spentSol).toBe(0.2);
    expect(capped.rows[0].sol).toBe(0.2);
    expect(capped.rows[1].sol).toBeNull();
    expect(capped.rows.every((row) => row.sent === false)).toBe(true);

    const balance = await readSolBalance("not-an-address", async () => {
      throw new Error("down");
    });
    expect(balance).toBeNull();
    expect(sizeCopies(copies, balance).spentSol).toBe(0);
  });
});
