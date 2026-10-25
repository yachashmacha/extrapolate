import { isWalletAddress } from "@/lib/address";
import { kolLabel, TRACKED_KOLS, type KolProfile } from "@/lib/kols";

const byWallet = new Map(TRACKED_KOLS.map((kol) => [kol.wallet, kol]));

/** Emoji and name from the KOL catalog. The address stays off the label. */
export function gropyName(wallet: string): string | null {
  const kol = byWallet.get(wallet);
  if (!kol) return null;
  return labelOf(kol);
}

export function labelOf(kol: KolProfile): string | null {
  if (!kol.name.trim() || isWalletAddress(kol.name)) return null;
  const label = kolLabel(kol).replace(/\s+/g, " ").trim();
  if (!label || label.includes(kol.wallet) || label.includes("·") || label.includes("…") || label.includes("...")) return null;
  return label;
}
