/** A closed KOL fill with a realized result that was already on file. Missing pnl never qualifies. */
export interface ClosedTrade {
  id: string;
  wallet: string;
  mint?: string;
  closedAt: string;
  pnlUsd: number;
  symbol?: string;
  coinName?: string;
  amountUsd?: number;
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

export interface CopyBook {
  copying: string | null;
  lossesTowardFire: number;
  copyingRealizedUsd: number | null;
  copyingCloses: number | null;
  copies: CopyFill[];
  fires: FireEvent[];
  skippedUnnamedBuys: number;
}
