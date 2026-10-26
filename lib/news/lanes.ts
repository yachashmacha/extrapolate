import type { NewsLane } from "@/lib/news/types";

const TESTS: { lane: NewsLane; pattern: RegExp }[] = [
  { lane: "memecoin", pattern: /\b(memecoins?|meme\s+coins?|pump\.fun|bonk|dogwifhat|pepe|dogecoin|doge|shiba|shib|floki|popcat|fartcoin|wif|libra)\b/i },
  { lane: "solana", pattern: /\b(solana|pump\.fun|jupiter|raydium|phantom|daos\.fun)\b/i },
  { lane: "rules", pattern: /\b(regulat\w*|sec|cftc|lawsuit|congress|senate|etf|ban|bill)\b/i },
  { lane: "strategy", pattern: /\b(trading\s+strateg\w*|breakouts?|momentum|funding\s+rates?|playbook|how\s+to\s+trade|copy\s+trad\w*|snipers?|bundl\w*|sector\s+rotation|narrative\s+(?:trade|meta|rotation)|altseason|latest\s+trend|trading\s+trend|prediction\s+markets?)\b/i },
  { lane: "markets", pattern: /\b(bitcoin|ethereum|\bbtc\b|\beth\b|rally|sell-?off|liquidat\w*|stablecoins?|prices?)\b/i },
];

/** A headline with no narrower match is filed under Markets. */
export function lanesFor(title: string, excerpt: string): NewsLane[] {
  const text = `${title} ${excerpt}`;
  const lanes = TESTS.filter((test) => test.pattern.test(text)).map((test) => test.lane);
  if (lanes.length === 0) return ["markets"];
  return lanes;
}

export function isNewsLane(value: string | undefined): value is NewsLane {
  return value === "memecoin" || value === "solana" || value === "markets" || value === "rules" || value === "strategy";
}
