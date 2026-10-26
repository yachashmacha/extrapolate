import type { AttentionCoin, CoinMark } from "@/lib/news/types";

const MAX_MARKS = 2;

/** Tickers a headline can say without naming a coin. */
const BLOCKED = new Set([
  "AI", "US", "SEC", "ETF", "NFT", "THE", "CAN", "AND", "FOR", "NEW", "ALL", "ONE", "TOP", "BIG",
  "COIN", "COINS", "TOKEN", "TOKENS", "PUMP", "MOON", "MEME", "MEMECOIN", "MEMECOINS", "NEWS",
  "FUND", "RATE", "BILL", "HOUSE", "TRADE", "TRADES", "MARKET", "MARKETS", "PRICE", "BASED",
  "SEND", "HOLD", "LONG", "SHORT", "CALL", "SWAP", "FEES", "FEE", "WALLET", "CHAIN", "THIS",
  "THAT", "WITH", "FROM", "HAVE", "WILL", "WHAT", "WHEN", "YOUR", "THEY", "THEM", "JUST", "ONLY",
  "OVER", "AFTER", "BEFORE", "ABOUT", "INTO", "ALSO", "MORE", "MOST", "SOME", "SUCH", "THAN",
  "THEN", "THERE", "THESE", "THOSE", "WERE", "BEEN", "BEING", "MADE", "MAKE", "MANY", "MUCH",
  "VERY", "OPEN", "WEEK", "YEAR", "SAYS", "SAID", "FACE", "KEY", "API", "CRYPTO", "SOLANA",
  "BITCOIN", "ETHEREUM", "DOGECOIN", "OFFICIAL", "STRATEGY", "STRATEGIES",
]);

const NAMED: { symbol: string; id: string; source: string }[] = [
  { symbol: "BTC", id: "bitcoin", source: "bitcoin|btc" },
  { symbol: "ETH", id: "ethereum", source: "ethereum|ether|eth" },
  { symbol: "SOL", id: "solana", source: "solana|sol" },
  { symbol: "DOGE", id: "dogecoin", source: "dogecoin|doge" },
  { symbol: "SHIB", id: "shiba-inu", source: "shiba\\s+inu|shiba|shib" },
  { symbol: "PEPE", id: "pepe", source: "pepe" },
  { symbol: "BONK", id: "bonk", source: "bonk" },
  { symbol: "WIF", id: "dogwifhat", source: "dogwifhat|wif" },
  { symbol: "FLOKI", id: "floki", source: "floki" },
  { symbol: "POPCAT", id: "popcat", source: "popcat" },
  { symbol: "FARTCOIN", id: "fartcoin", source: "fartcoin" },
];

const BY_CANON = new Map(NAMED.map((row) => [row.symbol, row]));
const TRUMP = { symbol: "TRUMP", id: "official-trump" };
const ALIAS: Record<string, string> = {
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  ETHER: "ETH",
  SOLANA: "SOL",
  DOGECOIN: "DOGE",
  SHIBA: "SHIB",
  DOGWIFHAT: "WIF",
};

export function quoteKey(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  return BY_CANON.get(upper)?.symbol ?? ALIAS[upper] ?? upper;
}

interface Hit {
  index: number;
  length: number;
  symbol: string;
  id: string | null;
}

export interface Mention {
  symbol: string;
  id: string | null;
}

export function findMentions(text: string, coins: AttentionCoin[]): Mention[] {
  if (!text.trim()) return [];
  const hits: Hit[] = [];

  for (const named of NAMED) {
    collect(text, new RegExp(`\\b(?:${named.source})\\b`, "gi"), named.symbol, named.id, hits);
  }
  collect(
    text,
    /(?:\$trump\b|\bofficial\s+trump\b|\btrump\s+(?:coin|memecoin)\b)/gi,
    TRUMP.symbol,
    TRUMP.id,
    hits,
  );

  for (const coin of coins) {
    const raw = coin.symbol.trim();
    if (!/^[A-Za-z0-9]{2,12}$/.test(raw)) continue;
    const upper = raw.toUpperCase();
    const known = BY_CANON.get(upper) ?? (upper === "TRUMP" ? TRUMP : null);
    const symbol = known?.symbol ?? raw.toUpperCase();
    const id = known?.id ?? null;
    const escaped = escapeRegExp(upper);
    collect(text, new RegExp(`\\$${escaped}\\b`, "gi"), symbol, id, hits);
    if (BLOCKED.has(upper)) continue;
    if (upper === "TRUMP") {
      collect(text, new RegExp(`\\b${escaped}\\b`, "g"), symbol, id, hits);
      continue;
    }
    if (upper.length >= 4) collect(text, new RegExp(`\\b${escaped}\\b`, "gi"), symbol, id, hits);
    else if (upper.length === 3) collect(text, new RegExp(`\\b${escaped}\\b`, "g"), symbol, id, hits);

    const name = coin.name.trim();
    if (nameIsSpecific(name)) {
      collect(text, new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), symbol, id, hits);
    }
  }

  hits.sort((left, right) => left.index - right.index || right.length - left.length);
  const taken: { start: number; end: number }[] = [];
  const seen = new Set<string>();
  const mentions: Mention[] = [];
  for (const hit of hits) {
    const end = hit.index + hit.length;
    if (taken.some((span) => hit.index < span.end && end > span.start)) continue;
    taken.push({ start: hit.index, end });
    if (seen.has(hit.symbol)) continue;
    seen.add(hit.symbol);
    mentions.push({ symbol: hit.symbol, id: hit.id });
    if (mentions.length >= MAX_MARKS) break;
  }
  return mentions;
}

export function marksFrom(mentions: Mention[], changes: Map<string, number>, holding: ReadonlySet<string>): CoinMark[] {
  return mentions.flatMap((mention) => {
    if (!holding.has(mention.symbol)) return [];
    const changePct = changes.get(mention.symbol);
    return changePct == null ? [] : [{ symbol: mention.symbol, changePct }];
  });
}

function collect(text: string, pattern: RegExp, symbol: string, id: string | null, hits: Hit[]) {
  for (const match of text.matchAll(pattern)) {
    if (match.index == null) continue;
    hits.push({ index: match.index, length: match[0].length, symbol, id });
  }
}

function nameIsSpecific(name: string): boolean {
  if (name.length < 8) return false;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  return words.some((word) => word.length >= 4 && !BLOCKED.has(word.toUpperCase()));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
