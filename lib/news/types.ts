export type NewsLane = "memecoin" | "solana" | "markets" | "rules" | "strategy";

export const NEWS_LANES: { id: NewsLane | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "memecoin", label: "Memecoins" },
  { id: "solana", label: "Solana" },
  { id: "markets", label: "Markets" },
  { id: "rules", label: "Rules and policy" },
  { id: "strategy", label: "Strategies" },
];

export interface CoinMark {
  symbol: string;
  changePct: number;
}

export interface WireItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  excerpt: string;
  lanes: NewsLane[];
  marks: CoinMark[];
}

export interface AttentionCoin {
  symbol: string;
  name: string;
  url: string;
  marketCapUsd: number | null;
  volumeUsd: number | null;
  changePct: number | null;
  boosts: number | null;
  blurb: string | null;
}

export interface XPost {
  text: string;
  author: string;
  handle: string;
  url: string;
  publishedAt: string;
  coinSymbol: string | null;
  marks: CoinMark[];
}

export interface NewsDesk {
  wires: WireItem[];
  coins: AttentionCoin[];
  posts: XPost[];
  missed: string[];
  loadedAt: string;
}
