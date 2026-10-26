import { isWalletAddress } from "@/lib/address";
import { sizeCopies } from "@/lib/gropy/spend";
import type { GropyCopyDraft, GropyCopyRow } from "@/lib/gropy/view";
import type { WalletKind } from "@/lib/wallet";

export const GROPY_SPEND_KEY = "gropy:spend-wallet";

const KINDS = new Set<WalletKind>(["phantom", "solflare", "backpack"]);

export function fundedCopies(drafts: readonly GropyCopyDraft[], balanceSol: number | null): GropyCopyRow[] {
  const sized = sizeCopies(
    drafts.map((draft, index) => ({ id: String(index), sol: draft.sol })),
    balanceSol,
  );
  return sized.rows.flatMap((row, index) => {
    const draft = drafts[index];
    if (!draft || row.sol == null || !(row.sol > 0)) return [];
    return [{ trader: draft.trader, coin: draft.coin, boughtAt: draft.boughtAt, sol: row.sol, sent: false }];
  });
}

export function parseSpendWallet(raw: string | null): { kind: WalletKind; address: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { kind?: unknown; address?: unknown };
    if (typeof parsed.kind !== "string" || !KINDS.has(parsed.kind as WalletKind)) return null;
    if (typeof parsed.address !== "string" || !isWalletAddress(parsed.address)) return null;
    return { kind: parsed.kind as WalletKind, address: parsed.address };
  } catch {
    return null;
  }
}
