import { eligibleWallets, FIRE_LOSS_LIMIT } from "@/lib/gropy/engine";
import { botPnlPoints, type PnlPoint } from "@/lib/gropy/pnl";
import { sizeCopies } from "@/lib/gropy/spend";
import type { ClosedTrade, CopyBook, CopyFill } from "@/lib/gropy/types";

export interface GropyCopyRow {
  trader: string;
  coin: string;
  boughtAt: string;
  sol: number | null;
  sent: false;
}

export interface GropyLogRow {
  at: string;
  firedName: string;
  losses: number;
  firedRealized: number;
  replacementName: string | null;
  replacementRealized: number | null;
}

export interface GropyView {
  catalogSize: number;
  verifiedCloses: number;
  scoredWallets: number;
  eligibleCount: number;
  botAddress: string;
  balanceSol: number | null;
  unit: "sol" | "usd";
  readCount: number;
  skippedCount: number;
  unreadableCount: number;
  skippedNames: string[];
  copying: string | null;
  lossesTowardFire: number;
  copyingRealized: number | null;
  copyingCloses: number | null;
  fireLossLimit: number;
  copies: GropyCopyRow[];
  log: GropyLogRow[];
  skippedUnnamedBuys: number;
  unfunded: boolean;
  pnl: PnlPoint[];
}

export function buildGropyView(input: {
  catalogSize: number;
  closed: readonly ClosedTrade[];
  book: CopyBook;
  nameOf: (wallet: string) => string | null;
  botAddress?: string;
  balanceSol?: number | null;
  readCount?: number;
  skippedWallets?: readonly string[];
  unreadableCount?: number;
  botCloses?: readonly { at: string; pnlSol: number }[];
  now?: Date;
}): GropyView {
  const balanceSol = input.balanceSol === undefined ? null : input.balanceSol;
  const funded = typeof balanceSol === "number" && balanceSol > 0;
  const sized = sizeCopies(
    input.book.copies.map((fill) => ({ id: fill.id, sol: fill.amountSol ?? null })),
    balanceSol,
  );
  const byId = new Map(input.book.copies.map((fill) => [fill.id, fill]));
  const copying = input.book.copying ? input.nameOf(input.book.copying) : null;
  const unit = input.closed.some((trade) => typeof trade.pnlSol === "number") ? "sol" : "usd";
  return {
    catalogSize: input.catalogSize,
    verifiedCloses: input.closed.length,
    scoredWallets: new Set(input.closed.map((trade) => trade.wallet)).size,
    eligibleCount: eligibleWallets(input.closed).length,
    botAddress: input.botAddress ?? "",
    balanceSol,
    unit,
    readCount: input.readCount ?? 0,
    skippedCount: input.skippedWallets?.length ?? 0,
    unreadableCount: input.unreadableCount ?? 0,
    skippedNames: unique(
      (input.skippedWallets ?? []).flatMap((wallet) => {
        const name = input.nameOf(wallet);
        return name ? [name] : [];
      }),
    ).sort((left, right) => left.localeCompare(right)),
    copying,
    lossesTowardFire: copying ? input.book.lossesTowardFire : 0,
    copyingRealized: copying ? input.book.copyingRealizedUsd : null,
    copyingCloses: copying ? input.book.copyingCloses : null,
    fireLossLimit: FIRE_LOSS_LIMIT,
    copies: funded ? sized.rows.flatMap((row) => copyRow(byId.get(row.id), row.sol, input.nameOf)) : [],
    log: input.book.fires.flatMap((fire) => {
      const firedName = input.nameOf(fire.firedWallet);
      if (!firedName) return [];
      const replacementName = fire.replacementWallet ? input.nameOf(fire.replacementWallet) : null;
      return [
        {
          at: fire.at,
          firedName,
          losses: fire.losses,
          firedRealized: fire.firedRealizedUsd,
          replacementName,
          replacementRealized: replacementName ? fire.replacementRealizedUsd : null,
        },
      ];
    }),
    skippedUnnamedBuys: input.book.skippedUnnamedBuys,
    unfunded: !funded,
    pnl: botPnlPoints(input.botCloses ?? [], input.now),
  };
}

function copyRow(fill: CopyFill | undefined, sol: number | null, nameOf: (wallet: string) => string | null): GropyCopyRow[] {
  if (!fill || sol == null || !(sol > 0)) return [];
  const trader = nameOf(fill.wallet);
  if (!trader) return [];
  return [{ trader, coin: fill.coin, boughtAt: fill.boughtAt, sol, sent: false }];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
