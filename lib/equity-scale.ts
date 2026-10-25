import { fmtUsd } from "@/lib/format";
import type { EquityPoint } from "@/lib/types";

const TZ = "America/New_York";

export const EQUITY_CHART = {
  width: 640,
  height: 228,
  padTop: 34,
  padBottom: 14,
  padX: 8,
} as const;

export interface EtStamp {
  date: string;
  time: string;
  label: string;
}

export interface EquityTick {
  value: number;
  label: string;
  y: number;
  tone: "low" | "zero" | "high" | "mid";
}

export interface EquityMark {
  roles: Array<"start" | "end" | "low">;
  kicker: string;
  x: number;
  labelX: number;
  y: number;
  pnl: number;
  label: string;
  stamp: EtStamp;
  /** Time also sits on the horizontal axis. */
  showAxisTime: boolean;
  place: "rise-right" | "rise-left" | "rise-center" | "rise-center-high" | "stack-above-end";
}

export interface EquityChartModel {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  min: number;
  max: number;
  ticks: EquityTick[];
  line: string;
  area: string;
  zeroY: number;
  end: number;
  marks: EquityMark[];
  aria: string;
}

export function etStamp(iso: string, withYear = false): EtStamp {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—", label: "—" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const dateText = withYear ? `${pick("month")} ${pick("day")}, ${pick("year")}` : `${pick("month")} ${pick("day")}`;
  const timeText = `${pick("hour")}:${pick("minute")} ${pick("dayPeriod")}`.replace(/\s+/g, " ").trim();
  return { date: dateText, time: timeText, label: `${dateText}, ${timeText} ET` };
}

export function etYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric" }).format(date);
}

/** First close that prints the low of the running PnL. */
export function worstEquityIndex(points: EquityPoint[]): number {
  let index = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].pnl < points[index].pnl) index = i;
  }
  return index;
}

function roundMoney(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function equityDomain(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: -1, max: 1 };
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  if (high - low < 0.005) return { min: roundMoney(low - 1), max: roundMoney(high + 1) };
  return { min: roundMoney(low), max: roundMoney(high) };
}

export function equityAxisTicks(min: number, max: number): number[] {
  const lo = roundMoney(Math.min(min, max));
  const hi = roundMoney(Math.max(min, max));
  const span = hi - lo || 1;
  const rough = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = Math.max(nice * magnitude, 0.01);
  const first = Math.ceil((lo - step * 1e-8) / step) * step;
  const count = Math.min(8, Math.max(0, Math.round((hi - first) / step)));
  const ticks: number[] = [];
  for (let i = 0; i <= count; i += 1) {
    const value = roundMoney(first + i * step);
    if (value >= lo - 0.001 && value <= hi + 0.001) ticks.push(value);
  }
  const required = [lo, hi];
  if (lo <= 0 && hi >= 0) required.push(0);
  for (const value of required) {
    if (!ticks.some((tick) => Math.abs(tick - value) < 0.001)) ticks.push(value);
  }
  return [...new Set(ticks.map((tick) => roundMoney(tick)))].sort((a, b) => a - b);
}

/** Keep zero and the low. Drop a tick that would sit on top of a label we already kept. */
export function spacedTicks(ticks: number[], yOf: (value: number) => number, gap: number): number[] {
  if (ticks.length === 0) return [];
  const min = ticks.reduce((a, b) => (a < b ? a : b));
  const zero = ticks.find((tick) => Math.abs(tick) < 0.001);
  const required = new Set<number>([min]);
  if (zero !== undefined) required.add(zero);

  const rank = (value: number) => {
    if (!required.has(value)) return 2;
    if (Math.abs(value) < 0.001) return 0;
    return 1;
  };
  const ranked = [...ticks].sort((a, b) => rank(a) - rank(b) || yOf(a) - yOf(b));
  const kept: number[] = [];
  const labels = new Set<string>();
  for (const tick of ranked) {
    const label = fmtUsd(tick);
    const optional = !required.has(tick);
    if (optional && kept.some((other) => Math.abs(yOf(other) - yOf(tick)) < gap)) continue;
    if (labels.has(label)) continue;
    kept.push(tick);
    labels.add(label);
  }
  return kept.sort((a, b) => a - b);
}

function kicker(roles: EquityMark["roles"]): string {
  const words: string[] = [];
  if (roles.includes("start")) words.push("Start");
  if (roles.includes("end")) words.push("End");
  if (roles.includes("low")) words.push("Low");
  return words.join(" · ");
}

export function buildEquityChart(points: EquityPoint[]): EquityChartModel | null {
  if (points.length < 2) return null;
  const { width, height, padTop, padBottom, padX } = EQUITY_CHART;
  const plotLeft = padX;
  const plotRight = width - padX;
  const plotBottom = height - padBottom;
  const plotHeight = plotBottom - padTop;
  const values = points.map((point) => point.pnl);
  const { min, max } = equityDomain(values);
  const span = max - min || 1;
  const yOf = (pnl: number) => padTop + (1 - (pnl - min) / span) * plotHeight;
  const xOf = (index: number) => plotLeft + (index / (points.length - 1)) * (plotRight - plotLeft);
  const coords = points.map((point, index) => [xOf(index), yOf(point.pnl)] as const);
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const zeroY = yOf(0);
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${line} L${last[0].toFixed(1)},${zeroY.toFixed(1)} L${first[0].toFixed(1)},${zeroY.toFixed(1)} Z`;

  const ticks = spacedTicks(equityAxisTicks(min, max), yOf, 22).map((value) => {
    const tone: EquityTick["tone"] =
      Math.abs(value) < 0.001 ? "zero" : Math.abs(value - min) < 0.001 ? "low" : value > 0 ? "high" : "mid";
    return { value, label: fmtUsd(value), y: yOf(value), tone };
  });

  const withYear = etYear(points[0].at) !== etYear(points[points.length - 1].at);
  const worst = worstEquityIndex(points);
  const groups = new Map<number, EquityMark["roles"]>();
  const add = (index: number, role: EquityMark["roles"][number]) => {
    const roles = groups.get(index) ?? [];
    roles.push(role);
    groups.set(index, roles);
  };
  add(0, "start");
  add(points.length - 1, "end");
  add(worst, "low");

  const plotWidth = plotRight - plotLeft;
  const marks: EquityMark[] = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, roles]) => {
      const point = points[index];
      const stamp = etStamp(point.at, withYear);
      const endX = xOf(points.length - 1);
      const neighbors = [...groups.keys()].filter((other) => other !== index);
      const crowded = neighbors.some((other) => Math.abs(xOf(other) - xOf(index)) < plotWidth * 0.22);
      const stackedOnEnd = !roles.includes("start") && !roles.includes("end") && Math.abs(endX - xOf(index)) < plotWidth * 0.1;
      const showAxisTime = roles.includes("start") || roles.includes("end") || !crowded;
      let place: EquityMark["place"] = "rise-center";
      if (roles.includes("start") && !roles.includes("end")) place = "rise-right";
      else if (roles.includes("end") && !roles.includes("start")) place = "rise-left";
      else if (stackedOnEnd) place = "stack-above-end";
      else if (crowded) place = "rise-center-high";
      return {
        roles,
        kicker: kicker(roles),
        x: xOf(index),
        labelX: stackedOnEnd ? endX : xOf(index),
        y: yOf(point.pnl),
        pnl: point.pnl,
        label: fmtUsd(point.pnl),
        stamp,
        showAxisTime,
        place,
      };
    });

  const start = marks.find((mark) => mark.roles.includes("start"));
  const end = marks.find((mark) => mark.roles.includes("end"));
  const low = marks.find((mark) => mark.roles.includes("low"));
  const aria = [
    "Closed equity in Eastern time.",
    start ? `Start ${start.label} on ${start.stamp.label}.` : "",
    end ? `End ${end.label} on ${end.stamp.label}.` : "",
    low ? `Low ${low.label} on ${low.stamp.label}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    width,
    height,
    plotLeft,
    plotRight,
    min,
    max,
    ticks,
    line,
    area,
    zeroY,
    end: points[points.length - 1]?.pnl ?? 0,
    marks,
    aria,
  };
}
