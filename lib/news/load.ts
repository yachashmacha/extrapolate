import { lanesFor } from "@/lib/news/lanes";
import { parseFeed } from "@/lib/news/parse";
import { mentionsMarket } from "@/lib/news/relevance";
import type { AttentionCoin, NewsDesk, WireItem, XPost } from "@/lib/news/types";

const WIRES: { name: string; url: string }[] = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
  { name: "The Block", url: "https://www.theblock.co/rss.xml" },
  { name: "DL News", url: "https://www.dlnews.com/arc/outboundfeeds/rss/" },
  { name: "Blockworks", url: "https://blockworks.co/feed" },
  { name: "Unchained", url: "https://unchainedcrypto.com/feed/" },
  { name: "Bankless", url: "https://www.bankless.com/rss/feed" },
  { name: "The Defiant", url: "https://thedefiant.io/feed" },
];

const BOOSTS_URL = "https://api.dexscreener.com/token-boosts/top/v1";
const PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1";
const MAX_WIRES = 40;
const PER_SOURCE = 8;
const MAX_COINS = 8;
const MAX_POSTS = 6;
const MAX_POST_CANDIDATES = 16;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CACHE_MS = 120_000;

let cached: { at: number; desk: NewsDesk } | null = null;

export async function loadNews(): Promise<NewsDesk> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.desk;
  const desk = await assembleNews(fetch);
  cached = { at: Date.now(), desk };
  return desk;
}

export async function assembleNews(fetchImpl: typeof fetch, now = new Date()): Promise<NewsDesk> {
  const missed: string[] = [];
  const wires = await loadWires(fetchImpl, now, missed);
  const { coins, posts } = await loadTape(fetchImpl, missed);
  return { wires, coins, posts, missed, loadedAt: now.toISOString() };
}

async function loadWires(fetchImpl: typeof fetch, now: Date, missed: string[]): Promise<WireItem[]> {
  const batches = await Promise.all(
    WIRES.map(async (source) => {
      try {
        const xml = await pull(fetchImpl, source.url);
        return parseFeed(xml)
          .map((item) => ({ ...item, source: source.name, lanes: lanesFor(item.title, item.excerpt) }))
          .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
          .slice(0, PER_SOURCE);
      } catch {
        missed.push(source.name);
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const cutoff = now.getTime() - MAX_AGE_MS;
  return batches
    .flat()
    .filter((item) => {
      const key = item.url.split("?")[0];
      if (seen.has(key)) return false;
      if (Date.parse(item.publishedAt) < cutoff) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, MAX_WIRES);
}

async function loadTape(fetchImpl: typeof fetch, missed: string[]): Promise<{ coins: AttentionCoin[]; posts: XPost[] }> {
  const [boosts, profiles] = await Promise.all([
    readJson<DexRow[]>(fetchImpl, BOOSTS_URL, "DexScreener boosts", missed),
    readJson<DexRow[]>(fetchImpl, PROFILES_URL, "DexScreener profiles", missed),
  ]);
  const rows = [...(boosts ?? []), ...(profiles ?? [])].filter((row) => row.chainId === "solana" && row.tokenAddress);
  const byAddress = new Map<string, DexRow>();
  for (const row of rows) {
    const prior = byAddress.get(row.tokenAddress);
    if (!prior) byAddress.set(row.tokenAddress, row);
    else byAddress.set(row.tokenAddress, { ...row, ...prior, links: prior.links ?? row.links, description: prior.description ?? row.description, totalAmount: prior.totalAmount ?? row.totalAmount });
  }
  const addresses = [...byAddress.keys()].slice(0, 20);
  if (addresses.length === 0) return { coins: [], posts: [] };
  const pairs = await readJson<DexPair[]>(fetchImpl, `https://api.dexscreener.com/tokens/v1/solana/${addresses.join(",")}`, "DexScreener pairs", missed);
  const ranked = addresses
    .flatMap((address) => {
      const coin = coinFrom(address, byAddress.get(address), pairs ?? []);
      return coin ? [{ address, coin }] : [];
    })
    .sort((left, right) => (right.coin.boosts ?? 0) - (left.coin.boosts ?? 0) || (right.coin.volumeUsd ?? 0) - (left.coin.volumeUsd ?? 0))
    .slice(0, MAX_COINS);
  const coins = ranked.map((row) => row.coin);
  const named = new Map(ranked.map((row) => [row.address, row.coin.symbol]));
  const posts = await loadPosts(fetchImpl, rows, named, missed);
  return { coins, posts };
}

function coinFrom(address: string, row: DexRow | undefined, pairs: DexPair[]): AttentionCoin | null {
  const matches = pairs.filter((pair) => pair.baseToken?.address === address && pair.baseToken.symbol && pair.chainId === "solana");
  const pair = matches.sort((left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0))[0];
  if (!pair?.baseToken?.symbol || !pair.url) return null;
  return {
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name || pair.baseToken.symbol,
    url: pair.url,
    marketCapUsd: numberOrNull(pair.marketCap) ?? numberOrNull(pair.fdv),
    volumeUsd: numberOrNull(pair.volume?.h24),
    changePct: numberOrNull(pair.priceChange?.h24),
    boosts: numberOrNull(row?.totalAmount),
    blurb: clip(row?.description ?? "", 180),
  };
}

async function loadPosts(fetchImpl: typeof fetch, rows: DexRow[], symbols: Map<string, string>, missed: string[]): Promise<XPost[]> {
  const wanted: { user: string; id: string; symbol: string | null }[] = [];
  const seen = new Set<string>();
  const ordered = [...rows].sort((left, right) => Number(symbols.has(right.tokenAddress)) - Number(symbols.has(left.tokenAddress)));
  for (const row of ordered) {
    for (const link of row.links ?? []) {
      const parsed = statusOf(link.url);
      if (!parsed || seen.has(parsed.id)) continue;
      seen.add(parsed.id);
      wanted.push({ ...parsed, symbol: symbols.get(row.tokenAddress) ?? null });
      if (wanted.length >= MAX_POST_CANDIDATES) break;
    }
    if (wanted.length >= MAX_POST_CANDIDATES) break;
  }
  const posts = await Promise.all(
    wanted.map(async (item) => {
      try {
        const body = await readJson<FxTweet>(fetchImpl, `https://api.fxtwitter.com/${item.user}/status/${item.id}`, "", []);
        const tweet = body?.tweet;
        const text = clip(tweet?.text ?? "", 420);
        const handle = tweet?.author?.screen_name;
        if (!text || !handle || !tweet?.url) return null;
        const publishedAt = tweetTime(tweet);
        if (!publishedAt) return null;
        return {
          text,
          author: tweet.author?.name || handle,
          handle,
          url: tweet.url,
          publishedAt,
          coinSymbol: item.symbol,
        } satisfies XPost;
      } catch {
        return null;
      }
    }),
  );
  const hydrated = posts.filter((post): post is XPost => post != null);
  if (wanted.length > 0 && hydrated.length === 0) missed.push("X");
  return hydrated
    .filter((post) => mentionsMarket(post.text))
    .sort((left, right) => Number(right.coinSymbol != null) - Number(left.coinSymbol != null) || Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, MAX_POSTS);
}

function statusOf(url: string | undefined): { user: string; id: string } | null {
  if (!url) return null;
  const match = url.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/i);
  if (!match) return null;
  if (match[1].toLowerCase() === "i" || match[1].toLowerCase() === "search") return null;
  return { user: match[1], id: match[2] };
}

function tweetTime(tweet: NonNullable<FxTweet["tweet"]>): string | null {
  if (typeof tweet.created_timestamp === "number" && Number.isFinite(tweet.created_timestamp)) {
    const ms = tweet.created_timestamp > 10_000_000_000 ? tweet.created_timestamp : tweet.created_timestamp * 1000;
    return new Date(ms).toISOString();
  }
  if (tweet.created_at) {
    const time = Date.parse(tweet.created_at);
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  return null;
}

async function readJson<T>(fetchImpl: typeof fetch, url: string, label: string, missed: string[]): Promise<T | null> {
  try {
    const text = await pull(fetchImpl, url);
    return JSON.parse(text) as T;
  } catch {
    if (label) missed.push(label);
    return null;
  }
}

async function pull(fetchImpl: typeof fetch, url: string): Promise<string> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/rss+xml, application/xml, application/json, text/xml, */*", "user-agent": "extrapolate-desk/1.0" },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.text();
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clip(value: string, limit: number): string | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

interface DexRow {
  chainId?: string;
  tokenAddress: string;
  url?: string;
  description?: string;
  totalAmount?: number;
  links?: { url?: string; type?: string }[];
}

interface DexPair {
  chainId?: string;
  url?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
}

interface FxTweet {
  tweet?: {
    url?: string;
    text?: string;
    created_at?: string;
    created_timestamp?: number;
    author?: { name?: string; screen_name?: string };
  };
}
