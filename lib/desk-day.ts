import { dayKeyEt } from "@/lib/calendar";

/**
 * A closed trade belongs to the America/New_York calendar day of its exit.
 * The same field dates the portfolio and the daily close count: a row with no
 * exit is still open, so it is not a trade on any day.
 */
export function todayKeyEt(now = new Date()): string {
  return dayKeyEt(now.toISOString());
}

export function deskDayName(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Today stays the word Today. A past day is the month and day a trader reads. */
export function analysingLabel(dayKey: string, now = new Date()): string {
  if (dayKey === todayKeyEt(now)) return "analysing: Today";
  return `analysing: ${deskDayName(dayKey)}`;
}

export function isSelectableDeskDay(dayKey: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return false;
  const today = todayKeyEt(now);
  if (!dayKey.startsWith(`${today.slice(0, 7)}-`)) return false;
  return dayKey <= today;
}

/** Days of the current Eastern month, newest first. Future days are left out. */
export function selectableDeskDays(now = new Date()): string[] {
  const today = todayKeyEt(now);
  const month = today.slice(0, 7);
  const last = Number(today.slice(8, 10));
  const days: string[] = [];
  for (let day = last; day >= 1; day -= 1) {
    days.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  return days;
}

export function deskTradesForDay<T extends { exitAt?: string }>(trades: readonly T[], dayKey: string, now = new Date()): T[] {
  if (!isSelectableDeskDay(dayKey, now)) return [];
  return trades.filter((trade) => Boolean(trade.exitAt) && dayKeyEt(trade.exitAt as string) === dayKey);
}
