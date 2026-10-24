import type { RoundTrip } from "@/lib/types";

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function median(values: number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export function winsOf(trades: RoundTrip[]): RoundTrip[] {
  return trades.filter((trade) => trade.pnlUsd > 0);
}

export function lossesOf(trades: RoundTrip[]): RoundTrip[] {
  return trades.filter((trade) => trade.pnlUsd < 0);
}

export function winRate(trades: RoundTrip[]): number {
  const decided = trades.filter((trade) => trade.pnlUsd !== 0);
  if (decided.length === 0) return 0;
  return winsOf(decided).length / decided.length;
}

export function net(trades: RoundTrip[]): number {
  return sum(trades.map((trade) => trade.pnlUsd));
}

export function mode(values: string[]): string {
  if (values.length === 0) return "—";
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

export function money(value: number): number {
  return Math.round(value * 100) / 100;
}
