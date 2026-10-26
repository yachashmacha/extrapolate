import { equityAxisTicks, equityDomain } from "@/lib/equity-scale";
import { fmtSol } from "@/lib/gropy/sol";

export interface PnlPoint {
  at: string;
  pnl: number;
}

const WIDTH = 640;
const HEIGHT = 168;
const PAD_TOP = 16;
const PAD_BOTTOM = 12;
const PAD_X = 8;

export interface PnlTick {
  value: number;
  label: string;
  y: number;
}

export interface GropyPnlChartModel {
  width: number;
  height: number;
  line: string;
  area: string;
  ticks: PnlTick[];
  startAt: string;
  endAt: string;
  end: number;
  flat: boolean;
  aria: string;
}

/** Running SOL result of the bot's own closed copies. No closes is a flat 0. */
export function botPnlPoints(closes: readonly { at: string; pnlSol: number }[], now: Date = new Date()): PnlPoint[] {
  const usable = closes
    .filter((close) => Number.isFinite(close.pnlSol) && Number.isFinite(Date.parse(close.at)))
    .slice()
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.at.localeCompare(right.at));
  if (usable.length === 0) {
    const end = now.toISOString();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    return [
      { at: start, pnl: 0 },
      { at: end, pnl: 0 },
    ];
  }
  let sum = 0;
  const firstAt = Date.parse(usable[0].at);
  const points: PnlPoint[] = [{ at: new Date(firstAt - 60 * 1000).toISOString(), pnl: 0 }];
  for (const close of usable) {
    sum = roundSol(sum + close.pnlSol);
    points.push({ at: close.at, pnl: sum });
  }
  return points;
}

export function buildGropyPnlChart(points: readonly PnlPoint[]): GropyPnlChartModel | null {
  if (points.length < 2) return null;
  const values = points.map((point) => point.pnl);
  const { min, max } = equityDomain(values);
  const span = max - min || 1;
  const plotBottom = HEIGHT - PAD_BOTTOM;
  const plotHeight = plotBottom - PAD_TOP;
  const plotRight = WIDTH - PAD_X;
  const yOf = (pnl: number) => PAD_TOP + (1 - (pnl - min) / span) * plotHeight;
  const xOf = (index: number) => PAD_X + (index / (points.length - 1)) * (plotRight - PAD_X);
  const coords = points.map((point, index) => [xOf(index), yOf(point.pnl)] as const);
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const zeroY = yOf(0);
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${line} L${last[0].toFixed(1)},${zeroY.toFixed(1)} L${first[0].toFixed(1)},${zeroY.toFixed(1)} Z`;
  const end = points[points.length - 1].pnl;
  const flat = points.every((point) => point.pnl === 0);
  const ticks = equityAxisTicks(min, max)
    .map((value) => ({ value, label: axisSol(value), y: yOf(value) }))
    .filter((tick, index, all) => all.findIndex((other) => other.label === tick.label) === index);
  return {
    width: WIDTH,
    height: HEIGHT,
    line,
    area,
    ticks,
    startAt: points[0].at,
    endAt: points[points.length - 1].at,
    end,
    flat,
    aria: flat ? "Bot PnL is 0 SOL. No copy has closed." : `Bot PnL ended at ${fmtSol(end, true)}.`,
  };
}

function axisSol(value: number): string {
  if (Math.abs(value) < 0.0000005) return "0";
  const abs = Math.abs(value);
  const digits = abs >= 10 ? 1 : abs >= 1 ? 1 : 2;
  const text = abs.toFixed(digits);
  return value < 0 ? `−${text}` : `+${text}`;
}

function roundSol(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}
