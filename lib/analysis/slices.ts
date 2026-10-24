import { hourEt, sessionOf } from "@/lib/format";
import type { RoundTrip } from "@/lib/types";
import { net, winRate } from "@/lib/analysis/stats";

export const MC_CUTS = [25_000, 60_000, 80_000, 120_000, 250_000, 600_000];
export const SIZE_CUTS = [150, 200, 250, 400, 500, 800];

export interface Split {
  cut: number;
  bad: RoundTrip[];
  good: RoundTrip[];
  damage: number;
}

export function bestSplit(
  trades: RoundTrip[],
  value: (trade: RoundTrip) => number,
  cuts: number[],
  minEach = 4,
): Split | null {
  let best: Split | null = null;
  for (const cut of cuts) {
    const usable = trades.filter((trade) => value(trade) > 0);
    const bad = usable.filter((trade) => value(trade) >= cut);
    const good = usable.filter((trade) => value(trade) < cut);
    if (bad.length < minEach || good.length < minEach) continue;
    const badNet = net(bad);
    const goodNet = net(good);
    if (badNet >= 0 || goodNet <= 0) continue;
    if (winRate(good) < winRate(bad) + 0.12) continue;
    const damage = -badNet;
    if (!best || damage > best.damage) best = { cut, bad, good, damage };
  }
  return best;
}

export function sessionName(trade: RoundTrip): "Morning" | "Midday" | "Evening" | "Overnight" {
  return sessionOf(hourEt(trade.entryAt));
}

export type KolMode = "early" | "late" | "none";

export function kolMode(trade: RoundTrip): KolMode {
  if (trade.kols.length === 0) return "none";
  if (trade.kols.some((kol) => kol.timing === "before" || kol.timing === "with")) return "early";
  return "late";
}

export function revengeIds(trades: RoundTrip[]): Set<string> {
  const ordered = [...trades].sort((a, b) => a.entryAt.localeCompare(b.entryAt));
  const sizes = ordered.map((trade) => trade.amountUsd).sort((a, b) => a - b);
  const mid = Math.floor(sizes.length / 2);
  const medianSize = sizes.length === 0 ? 0 : sizes.length % 2 ? sizes[mid] : (sizes[mid - 1] + sizes[mid]) / 2;
  const flagged = new Set<string>();
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.pnlUsd < 0 && current.amountUsd >= medianSize * 1.35) flagged.add(current.id);
  }
  return flagged;
}

export function holdBand(minutes: number): string {
  if (minutes < 3) return "Under 3 minutes";
  if (minutes < 15) return "3–15 minutes";
  if (minutes < 45) return "15–45 minutes";
  if (minutes < 180) return "45 minutes–3 hours";
  return "Over 3 hours";
}

export function mcBand(value: number): string | null {
  if (value <= 0) return null;
  if (value < 25_000) return "Under $25k";
  if (value < 60_000) return "$25k–$60k";
  if (value < 120_000) return "$60k–$120k";
  if (value < 250_000) return "$120k–$250k";
  if (value < 600_000) return "$250k–$600k";
  return "Above $600k";
}

export function sizeBand(value: number): string {
  if (value < 100) return "Under $100";
  if (value < 250) return "$100–$250";
  if (value < 500) return "$250–$500";
  return "$500 and up";
}
