import { describe, expect, it } from "vitest";
import { findMentions } from "@/lib/news/marks";
import type { AttentionCoin } from "@/lib/news/types";

function coin(symbol: string, name = symbol): AttentionCoin {
  return {
    symbol,
    name,
    url: `https://dexscreener.com/solana/${symbol}`,
    marketCapUsd: 1,
    volumeUsd: 1,
    changePct: 1,
    boosts: 1,
    blurb: null,
  };
}

describe("coin mentions", () => {
  it("keeps the first two named coins and skips a bare Trump", () => {
    expect(findMentions("Dogecoin, pepe, then bonk", []).map((row) => row.symbol)).toEqual(["DOGE", "PEPE"]);
    expect(findMentions("Trump spoke at a rally", []).map((row) => row.symbol)).toEqual([]);
    expect(findMentions("$TRUMP and the official trump coin", []).map((row) => row.symbol)).toEqual(["TRUMP"]);
    expect(findMentions("A trump memecoin listing", []).map((row) => row.symbol)).toEqual(["TRUMP"]);
  });

  it("reads a boosted ticker from the tape without treating an English word as a coin", () => {
    const coins = [coin("AXE", "Axe"), coin("SEC", "Sec"), coin("COIN", "Coin"), coin("WIF", "dogwifhat")];
    expect(findMentions("axe is lowercase", coins).map((row) => row.symbol)).toEqual([]);
    expect(findMentions("AXE is the print", coins).map((row) => row.symbol)).toEqual(["AXE"]);
    expect(findMentions("Watch $SEC and this coin", coins).map((row) => row.symbol)).toEqual(["SEC"]);
    expect(findMentions("dogwifhat is the name in the headline", coins).map((row) => row.symbol)).toEqual(["WIF"]);
  });
});
