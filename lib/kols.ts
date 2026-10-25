import tracked from "@/lib/kols/tracked.json";
import { isWalletAddress } from "@/lib/address";
import { shortAddress } from "@/lib/format";
import type { KolTag, KolTiming } from "@/lib/types";

export interface KolProfile {
  id: string;
  handle: string;
  name: string;
  wallet: string;
  emoji: string;
}

interface RawKol {
  wallet: string;
  name: string;
  emoji: string;
}

/** The wallets to check for a buy of any coin in the book. The id is the wallet, because names repeat. */
export const TRACKED_KOLS: KolProfile[] = (tracked as RawKol[]).map((row) => ({
  id: row.wallet,
  handle: row.wallet,
  name: row.name,
  wallet: row.wallet,
  emoji: row.emoji,
}));

const byWallet = new Map(TRACKED_KOLS.map((kol) => [kol.wallet, kol]));
const byName = new Map<string, KolProfile[]>();
for (const kol of TRACKED_KOLS) {
  const key = kol.name.toLowerCase();
  const list = byName.get(key) ?? [];
  list.push(kol);
  byName.set(key, list);
}

/** A name is only useful next to the wallet it belongs to. */
export function kolLabel(kol: { name: string; handle?: string; wallet?: string }): string {
  const wallet = kol.wallet || (kol.handle && isWalletAddress(kol.handle) ? kol.handle : "");
  const profile = wallet ? byWallet.get(wallet) : undefined;
  const emoji = profile?.emoji ? `${profile.emoji} ` : "";
  const who = `${emoji}${kol.name}`;
  return wallet ? `${who} · ${shortAddress(wallet)}` : who;
}

export function searchKols(query: string, limit = 8): KolProfile[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: KolProfile[] = [];
  for (const kol of TRACKED_KOLS) {
    const wallet = kol.wallet.toLowerCase();
    if (kol.name.toLowerCase().includes(needle) || wallet.startsWith(needle) || (needle.length >= 4 && wallet.includes(needle))) {
      hits.push(kol);
      if (hits.length === limit) break;
    }
  }
  return hits;
}

export function kolFromSpec(spec: string): KolTag {
  const [rawId, rawTiming] = spec.split(":");
  const id = rawId.trim().replace(/^@/, "");
  const timing = normalizeTiming(rawTiming);
  if (isWalletAddress(id)) {
    const known = byWallet.get(id);
    return {
      id: known?.wallet ?? id,
      handle: known?.wallet ?? id,
      name: known?.name ?? shortAddress(id),
      wallet: known?.wallet ?? id,
      timing,
    };
  }
  const handle = id.toLowerCase();
  return {
    id: handle,
    handle,
    name: handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : handle,
    timing,
  };
}

export function makeKol(idOrHandle: string, timing: KolTiming = "before"): KolTag {
  return kolFromSpec(`${idOrHandle}:${timing}`);
}

/** One tag per wallet. The same mint can sit before one fill and after another. */
export function tagsFromHits(
  hits: { wallet: string; name: string; boughtAt: string }[],
  entryAt: string,
): KolTag[] {
  const earliest = new Map<string, { wallet: string; name: string; boughtAt: string }>();
  for (const hit of hits) {
    const prev = earliest.get(hit.wallet);
    if (!prev || hit.boughtAt < prev.boughtAt) earliest.set(hit.wallet, hit);
  }
  const order: Record<KolTiming, number> = { before: 0, with: 1, after: 2 };
  return [...earliest.values()]
    .map((hit) => ({
      id: hit.wallet,
      handle: hit.wallet,
      name: hit.name,
      wallet: hit.wallet,
      timing: timingAgainstEntry(hit.boughtAt, entryAt),
    }))
    .sort((left, right) => order[left.timing] - order[right.timing] || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export const KOL_WITH_MS = 90_000;

export function timingAgainstEntry(boughtAt: string, entryAt: string): KolTiming {
  const bought = Date.parse(boughtAt);
  const entry = Date.parse(entryAt);
  if (!Number.isFinite(bought) || !Number.isFinite(entry)) return "with";
  const delta = bought - entry;
  if (Math.abs(delta) <= KOL_WITH_MS) return "with";
  return delta < 0 ? "before" : "after";
}

function normalizeTiming(value: string | undefined): KolTiming {
  if (value === "with" || value === "after" || value === "before") return value;
  return "before";
}

export function namesSharingWalletCount(): number {
  let shared = 0;
  for (const list of byName.values()) if (list.length > 1) shared += 1;
  return shared;
}
