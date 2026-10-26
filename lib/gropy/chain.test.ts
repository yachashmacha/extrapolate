import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadKolRecords, mintsForNames } from "@/lib/gropy/chain";

const wallet = "Wallet11111111111111111111111111111111111";

function metadata(name: string, symbol: string) {
  const nameBytes = new TextEncoder().encode(name);
  const symbolBytes = new TextEncoder().encode(symbol);
  const bytes = new Uint8Array(1 + 32 + 32 + 4 + nameBytes.length + 4 + symbolBytes.length);
  let offset = 1 + 32 + 32;
  bytes[offset] = nameBytes.length;
  offset += 4;
  bytes.set(nameBytes, offset);
  offset += nameBytes.length;
  bytes[offset] = symbolBytes.length;
  offset += 4;
  bytes.set(symbolBytes, offset);
  return { value: { data: [Buffer.from(bytes).toString("base64"), "base64"] } };
}

describe("open-lot names", () => {
  it("names a coin that is still open before older unnamed buys", () => {
    const held = Keypair.generate().publicKey.toBase58();
    const older = Array.from({ length: 6 }, () => Keypair.generate().publicKey.toBase58());
    const buys = [...older.map((mint) => ({ mint })), { mint: held }];
    expect(mintsForNames(buys, [{ mint: held }])[0]).toBe(held);
    expect(mintsForNames(buys, [{ mint: held }])).toContain(held);
    expect(mintsForNames([{ mint: held, symbol: "PEPE" }, ...older.map((mint) => ({ mint }))], [{ mint: held }])).not.toContain(held);
  });

  it("fills in the name of a cached open lot and leaves a sold coin unnamed", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gropy-names-"));
    const cachePath = path.join(dir, "chain.json");
    const openMint = Keypair.generate().publicKey.toBase58();
    const soldMint = Keypair.generate().publicKey.toBase58();
    const asked: string[] = [];
    writeFileSync(
      cachePath,
      JSON.stringify({
        cursor: 0,
        wallets: {
          [wallet]: {
            at: Date.now(),
            closed: [],
            buys: [
              { id: `buy-open|${openMint}`, wallet, mint: openMint, boughtAt: "2026-10-20T12:00:00.000Z" },
              { id: `buy-sold|${soldMint}`, wallet, mint: soldMint, boughtAt: "2026-10-20T11:00:00.000Z" },
            ],
            open: [{ id: `buy-open|${openMint}`, wallet, mint: openMint, tokens: 40 }],
          },
        },
      }),
    );
    const read = await loadKolRecords({
      wallets: [{ wallet }],
      cachePath,
      budgetMs: 5_000,
      rpc: async (method) => {
        asked.push(method);
        if (method === "getAccountInfo") return metadata("Pepe", "PEPE");
        throw new Error(method);
      },
    });
    expect(asked).toEqual(["getAccountInfo"]);
    const openBuy = read.buys.find((buy) => buy.mint === openMint);
    const soldBuy = read.buys.find((buy) => buy.mint === soldMint);
    expect(openBuy?.symbol).toBe("PEPE");
    expect(openBuy?.coinName).toBe("Pepe");
    expect(soldBuy?.symbol).toBeUndefined();
    const stored = JSON.parse(readFileSync(cachePath, "utf8")) as { wallets: Record<string, { buys: { mint: string; symbol?: string }[] }> };
    expect(stored.wallets[wallet].buys.find((buy) => buy.mint === openMint)?.symbol).toBe("PEPE");
  });

  it("reads a Token-2022 name when the mint has no Metaplex account", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gropy-token2022-"));
    const cachePath = path.join(dir, "chain.json");
    const openMint = Keypair.generate().publicKey.toBase58();
    const asked: string[] = [];
    writeFileSync(
      cachePath,
      JSON.stringify({
        cursor: 0,
        wallets: {
          [wallet]: {
            at: Date.now(),
            closed: [],
            buys: [{ id: `buy-open|${openMint}`, wallet, mint: openMint, boughtAt: "2026-10-20T12:00:00.000Z" }],
            open: [{ id: `buy-open|${openMint}`, wallet, mint: openMint, tokens: 12 }],
          },
        },
      }),
    );
    const read = await loadKolRecords({
      wallets: [{ wallet }],
      cachePath,
      budgetMs: 5_000,
      rpc: async (method, params) => {
        asked.push(method);
        const address = params[0];
        if (address === openMint) {
          return {
            value: {
              data: {
                parsed: {
                  info: {
                    extensions: [{ extension: "tokenMetadata", state: { name: "The Normie", symbol: "NORMIE" } }],
                  },
                },
              },
            },
          };
        }
        return { value: null };
      },
    });
    expect(asked).toEqual(["getAccountInfo", "getAccountInfo"]);
    expect(read.buys.find((buy) => buy.mint === openMint)?.symbol).toBe("NORMIE");
    expect(read.buys.find((buy) => buy.mint === openMint)?.coinName).toBe("The Normie");
  });
});
