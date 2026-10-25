import { eligibleWallets, FIRE_LOSS_LIMIT } from "@/lib/gropy/engine";
import type { ClosedTrade, CopyBook, CopyFill } from "@/lib/gropy/types";

export interface GropyCopyRow {
  trader: string;
  coin: string;
  boughtAt: string;
  amountUsd?: number;
  entryMarketCapUsd?: number;
}

export interface GropyLogRow {
  at: string;
  firedName: string;
  losses: number;
  firedRealizedUsd: number;
  replacementName: string | null;
  replacementRealizedUsd: number | null;
}

export interface GropyView {
  catalogSize: number;
  verifiedCloses: number;
  scoredWallets: number;
  eligibleCount: number;
  buyOnlyCount: number;
  unscoredNames: string[];
  copying: string | null;
  lossesTowardFire: number;
  copyingRealizedUsd: number | null;
  copyingCloses: number | null;
  fireLossLimit: number;
  copies: GropyCopyRow[];
  log: GropyLogRow[];
  skippedUnnamedBuys: number;
}

export function buildGropyView(input: {
  catalogSize: number;
  closed: readonly ClosedTrade[];
  buyOnlyWallets: readonly string[];
  book: CopyBook;
  nameOf: (wallet: string) => string | null;
}): GropyView {
  const copying = input.book.copying ? input.nameOf(input.book.copying) : null;
  return {
    catalogSize: input.catalogSize,
    verifiedCloses: input.closed.length,
    scoredWallets: new Set(input.closed.map((trade) => trade.wallet)).size,
    eligibleCount: eligibleWallets(input.closed).length,
    buyOnlyCount: input.buyOnlyWallets.length,
    unscoredNames: unique(
      input.buyOnlyWallets.flatMap((wallet) => {
        const name = input.nameOf(wallet);
        return name ? [name] : [];
      }),
    ).sort((left, right) => left.localeCompare(right)),
    copying,
    lossesTowardFire: copying ? input.book.lossesTowardFire : 0,
    copyingRealizedUsd: copying ? input.book.copyingRealizedUsd : null,
    copyingCloses: copying ? input.book.copyingCloses : null,
    fireLossLimit: FIRE_LOSS_LIMIT,
    copies: input.book.copies.flatMap((fill) => copyRow(fill, input.nameOf)),
    log: input.book.fires.flatMap((fire) => {
      const firedName = input.nameOf(fire.firedWallet);
      if (!firedName) return [];
      const replacementName = fire.replacementWallet ? input.nameOf(fire.replacementWallet) : null;
      return [
        {
          at: fire.at,
          firedName,
          losses: fire.losses,
          firedRealizedUsd: fire.firedRealizedUsd,
          replacementName,
          replacementRealizedUsd: replacementName ? fire.replacementRealizedUsd : null,
        },
      ];
    }),
    skippedUnnamedBuys: input.book.skippedUnnamedBuys,
  };
}

function copyRow(fill: CopyFill, nameOf: (wallet: string) => string | null): GropyCopyRow[] {
  const trader = nameOf(fill.wallet);
  if (!trader) return [];
  const row: GropyCopyRow = { trader, coin: fill.coin, boughtAt: fill.boughtAt };
  if (typeof fill.amountUsd === "number") row.amountUsd = fill.amountUsd;
  if (typeof fill.entryMarketCapUsd === "number") row.entryMarketCapUsd = fill.entryMarketCapUsd;
  return [row];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
