import { hourEt, sessionOf } from "@/lib/format";
import type { RoundTrip } from "@/lib/types";
import { median, net, winRate } from "@/lib/analysis/stats";

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

/** A size change is a reaction to the last close only inside this window. Hours later is a new decision. */
export const REACTION_MINUTES = 30;

/** The next ticket has to clear both the usual size and the ticket that just closed, by half. */
export const SIZE_UP = 1.5;

/** Writes 4× or 1.5× for how far an amount sits above the usual ticket. */
export function sizeMultiple(amount: number, usual: number): string {
  if (!(usual > 0) || !(amount > 0)) return "1.5×";
  const tenths = Math.round((amount / usual) * 10) / 10;
  if (Math.abs(tenths - Math.round(tenths)) < 0.05) return `${Math.round(tenths)}×`;
  return `${tenths.toFixed(1)}×`;
}

export function reactedSoon(previous: { exitAt: string }, current: { entryAt: string }): boolean {
  const gap = Date.parse(current.entryAt) - Date.parse(previous.exitAt);
  return Number.isFinite(gap) && gap >= 0 && gap <= REACTION_MINUTES * 60_000;
}

export function sizedUpMaterially(amount: number, previousAmount: number, usual: number): boolean {
  if (!(usual > 0) || !(previousAmount > 0) || !(amount > 0)) return false;
  return amount >= usual * SIZE_UP && amount >= previousAmount * SIZE_UP;
}

/**
 * Revenge trading is a larger ticket placed soon after a red close to get the loss back.
 * The loss itself has to be about the usual size: under 1.5× this trader's median.
 * A size-up after a ticket that was already that large is not loss-chasing.
 * The next entry has to land within 30 minutes, and the ticket has to be at least 1.5×
 * the usual size and at least 1.5× the losing ticket. A slightly larger ticket, or a
 * larger ticket hours later, is not loss-chasing.
 *
 * House money is the same size-up, soon after a win, because the gain feels spendable.
 * A bigger ticket the next session is not house money. The win does not have to be the usual size.
 */
export function revengeIds(trades: RoundTrip[]): Set<string> {
  return reactionIds(trades, (previous) => previous.pnlUsd < 0, true);
}

export function houseMoneyIds(trades: RoundTrip[]): Set<string> {
  return reactionIds(trades, (previous) => previous.pnlUsd > 0, false);
}

function reactionIds(trades: RoundTrip[], when: (trade: RoundTrip) => boolean, requireUsualLoss: boolean): Set<string> {
  const ordered = [...trades].sort((left, right) => left.entryAt.localeCompare(right.entryAt) || left.id.localeCompare(right.id));
  const usual = median(ordered.map((trade) => trade.amountUsd).filter((value) => value > 0));
  const flagged = new Set<string>();
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!when(previous) || !reactedSoon(previous, current)) continue;
    if (requireUsualLoss && !(previous.amountUsd < usual * SIZE_UP)) continue;
    if (!sizedUpMaterially(current.amountUsd, previous.amountUsd, usual)) continue;
    flagged.add(current.id);
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
