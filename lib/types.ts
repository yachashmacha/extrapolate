export type MetaId =
  | "animal"
  | "political"
  | "celebrity"
  | "ai"
  | "food"
  | "culture"
  | "country"
  | "other";

export type TerminalId =
  | "axiom"
  | "photon"
  | "bullx"
  | "gmgn"
  | "trojan"
  | "bloom"
  | "padre"
  | "pump"
  | "banana"
  | "wallet";

export type KolTiming = "before" | "with" | "after";

export interface KolTag {
  id: string;
  handle: string;
  name: string;
  timing: KolTiming;
  /** Set when the tag is one of the tracked wallets. */
  wallet?: string;
}

export interface RoundTrip {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  metas: MetaId[];
  terminal: TerminalId;
  entryAt: string;
  exitAt: string;
  entryMarketCapUsd: number;
  exitMarketCapUsd: number;
  liquidityUsd: number;
  amountUsd: number;
  pnlUsd: number;
  pnlPct: number;
  holdMinutes: number;
  kols: KolTag[];
  /** Minutes from the pool opening. Negative when the chain read could not tell. */
  minutesFromLaunch: number;
  buys: number;
  sells: number;
  /** Daily high on the main pool, times the same supply used for entry market cap. */
  athMarketCapUsd?: number;
  /**
   * Pump.fun graduation market cap in dollars at the entry, from that day's SOL price.
   * Absent when the coin is not on that curve or the SOL price was not read.
   */
  graduationMarketCapUsd?: number;
  /**
   * True when the five completed minutes before the entry did at most 75% of the
   * volume of the five minutes before that. False when the tape was flat, rising,
   * or too quiet to be a fade. Absent when those candles were not read.
   */
  volumeFalling?: boolean;
  /** A later buy in this round trip was at least 10% under the average already held. */
  averagedDown?: boolean;
}

export interface OpenPosition {
  mint: string;
  symbol: string;
  name: string;
  tokens: number;
  costUsd: number;
  entryAt: string;
  entryMarketCapUsd: number;
  metas: MetaId[];
}

export interface Book {
  source: "sample" | "wallet" | "csv";
  address?: string;
  terminal: TerminalId;
  label: string;
  trades: RoundTrip[];
  opens: OpenPosition[];
  warnings: string[];
  fetchedAt: string;
  scannedTransactions?: number;
  /** SOL plus stables in the wallet, in dollars, plus the cost of coins still open. */
  accountUsd?: number;
}

export type PlayCategory = "entry" | "size" | "callers" | "narrative" | "behavior";

export interface PlayCard {
  id: string;
  category: PlayCategory;
  tone: "fix" | "keep";
  title: string;
  shortLabel: string;
  sample: number;
  winRate: number;
  netPnlUsd: number;
  damageUsd: number;
  evidence: string;
  rule: string;
  steps: string[];
  tradeIds: string[];
}

export interface Pattern {
  id: string;
  label: string;
  side: "win" | "loss";
  winnerShare: number;
  loserShare: number;
  winRate: number;
  n: number;
  netPnlUsd: number;
  tradeIds: string[];
}

export interface SidePortrait {
  trades: number;
  medianEntryMc: number;
  medianSize: number;
  medianHold: number;
  medianLiquidity: number;
  medianLaunchMin: number;
  avgKols: number;
  topMeta: string;
  topSession: string;
  topKols: string[];
  netPnlUsd: number;
}

export interface KolReport {
  id: string;
  name: string;
  handle: string;
  wallet?: string;
  trades: number;
  winRate: number;
  netPnlUsd: number;
  usualTiming: string;
  tradeIds: string[];
}

export interface MetaReport {
  id: MetaId;
  label: string;
  trades: number;
  winRate: number;
  netPnlUsd: number;
  medianEntryMc: number;
  tradeIds: string[];
}

export interface Summary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnlUsd: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  profitFactor: number | null;
  expectancyUsd: number;
  avgWinPct: number;
  avgLossPct: number;
  medianHold: number;
  spanLabel: string;
}

export interface EquityPoint {
  at: string;
  pnl: number;
}

export interface AnnotatedTrade extends RoundTrip {
  result: "win" | "loss";
  tags: string[];
  note: string;
  session: string;
  revenge: boolean;
}

export interface Analysis {
  summary: Summary;
  lede: string;
  comparison: { winners: SidePortrait; losers: SidePortrait };
  patterns: Pattern[];
  fixes: PlayCard[];
  keeps: PlayCard[];
  checklist: string[];
  kols: KolReport[];
  metas: MetaReport[];
  equity: EquityPoint[];
  trades: AnnotatedTrade[];
  thin: boolean;
}
