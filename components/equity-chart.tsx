import { fmtUsd } from "@/lib/format";
import type { EquityPoint } from "@/lib/types";

export function EquityChart({ points }: { points: EquityPoint[] }) {
  if (points.length < 2) return null;
  const width = 640;
  const height = 200;
  const pad = 18;
  const values = points.map((point) => point.pnl);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (point.pnl - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const zeroY = pad + (1 - (0 - min) / span) * (height - pad * 2);
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${line} L${last[0].toFixed(1)},${zeroY.toFixed(1)} L${first[0].toFixed(1)},${zeroY.toFixed(1)} Z`;
  const end = points[points.length - 1]?.pnl ?? 0;

  return (
    <svg className="equity" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Closed-trade equity ending at ${fmtUsd(end)}`}>
      <line className="zero" x1={pad} x2={width - pad} y1={zeroY} y2={zeroY} />
      <path className="area" d={area} />
      <path d={line} fill="none" stroke={end >= 0 ? "var(--sage)" : "var(--clay)"} strokeWidth="2.4" />
    </svg>
  );
}
