export interface SizedCopy {
  id: string;
  sol: number | null;
  sent: false;
}

/**
 * A copy is never broadcast here. Size, when one is shown, is capped by the SOL
 * actually in the bot wallet. Zero or an unread balance spends nothing.
 */
export function sizeCopies(
  copies: readonly { id: string; sol: number | null }[],
  balanceSol: number | null,
): { rows: SizedCopy[]; spentSol: number } {
  if (typeof balanceSol !== "number" || !Number.isFinite(balanceSol) || balanceSol <= 0) {
    return {
      rows: copies.map((copy) => ({ id: copy.id, sol: null, sent: false })),
      spentSol: 0,
    };
  }
  let left = balanceSol;
  const rows = copies.map((copy) => {
    if (!(left > 0) || typeof copy.sol !== "number" || !Number.isFinite(copy.sol) || copy.sol <= 0) {
      return { id: copy.id, sol: null, sent: false as const };
    }
    const sol = Math.min(copy.sol, left);
    left -= sol;
    return { id: copy.id, sol, sent: false as const };
  });
  const spentSol = roundSol(rows.reduce((sum, row) => sum + (row.sol ?? 0), 0));
  return {
    rows: rows.map((row) => (row.sol == null ? row : { ...row, sol: roundSol(row.sol) })),
    spentSol,
  };
}

function roundSol(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}
