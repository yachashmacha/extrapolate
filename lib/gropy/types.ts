/** A closed round trip from a wallet's own swaps. Missing pnl never qualifies. */
export interface ClosedTrade {
  id: string;
  wallet: string;
  mint?: string;
  closedAt: string;
  /** Set when the result was priced in dollars. */
  pnlUsd?: number;
  /** Set when the result is the SOL that actually moved. Not a converted dollar guess. */
  pnlSol?: number;
  symbol?: string;
  coinName?: string;
  amountUsd?: number;
  amountSol?: number;
  entryMarketCapUsd?: number;
}

/** A buy that was already on file. No pnl is inferred from it. */
export interface BuySignal {
  id: string;
  wallet: string;
  mint: string;
  boughtAt: string;
  symbol?: string;
  coinName?: string;
  amountUsd?: number;
  amountSol?: number;
  entryMarketCapUsd?: number;
}

export interface WalletScore {
  wallet: string;
  closed: number;
  losses: number;
  realizedUsd: number;
  profitable: boolean;
}

export interface CopyFill {
  id: string;
  wallet: string;
  boughtAt: string;
  coin: string;
  amountUsd?: number;
  amountSol?: number;
  entryMarketCapUsd?: number;
}

export interface FireEvent {
  at: string;
  firedWallet: string;
  losses: number;
  firedRealizedUsd: number;
  replacementWallet: string | null;
  replacementRealizedUsd: number | null;
}

/** A buy copied while a wallet was seated, with a market cap only when the swap had one. */
export interface SeatedBuyCap {
  coin: string | null;
  marketCapUsd: number;
}

/** One time the seat left a wallet. Facts are the closes and buys while they were copied. */
export interface SeatChange {
  at: string;
  fromWallet: string;
  toWallet: string | null;
  losses: number;
  streak: number;
  lost: number;
  fromRealized: number;
  toRealized: number | null;
  trigger: "losses" | "unprofitable";
  lossCoins: string[];
  buyCaps: SeatedBuyCap[];
}

export interface CopyBook {
  copying: string | null;
  lossesTowardFire: number;
  copyingRealizedUsd: number | null;
  copyingCloses: number | null;
  copies: CopyFill[];
  fires: FireEvent[];
  switches: SeatChange[];
  copyingStreak: number;
  copyingLost: number;
  skippedUnnamedBuys: number;
}
