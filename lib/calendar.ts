const TZ = "America/New_York";

export interface CalendarCell {
  dayKey: string | null;
  day: number | null;
}

export interface DayPnl {
  dayKey: string;
  pnlUsd: number;
  trades: number;
  wins: number;
  losses: number;
}

export function dayKeyEt(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function currentMonthEt(now = new Date()): string {
  return dayKeyEt(now.toISOString()).slice(0, 7);
}

/** Sunday = 0. Noon-safe so a date-only key does not shift across the Eastern offset. */
export function weekdayEt(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(instant);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
  return index < 0 ? 0 : index;
}

export function monthGrid(month: string): CalendarCell[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: CalendarCell[] = [];
  for (let index = 0; index < weekdayEt(`${month}-01`); index += 1) {
    cells.push({ dayKey: null, day: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ dayKey: `${month}-${String(day).padStart(2, "0")}`, day });
  }
  while (cells.length % 7 !== 0) cells.push({ dayKey: null, day: null });
  return cells;
}

export function dailyPnl(trades: { exitAt: string; pnlUsd: number }[]): DayPnl[] {
  const rows = new Map<string, DayPnl>();
  for (const trade of trades) {
    const dayKey = dayKeyEt(trade.exitAt);
    const row = rows.get(dayKey) ?? { dayKey, pnlUsd: 0, trades: 0, wins: 0, losses: 0 };
    row.pnlUsd += trade.pnlUsd;
    row.trades += 1;
    if (trade.pnlUsd >= 0) row.wins += 1;
    else row.losses += 1;
    rows.set(dayKey, row);
  }
  return [...rows.values()].sort((left, right) => left.dayKey.localeCompare(right.dayKey));
}

export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function dayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
