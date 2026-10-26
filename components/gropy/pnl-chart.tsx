import { etStamp, etYear } from "@/lib/equity-scale";
import { fmtSol } from "@/lib/gropy/sol";
import { buildGropyPnlChart, type PnlPoint } from "@/lib/gropy/pnl";
import styles from "./gropy.module.css";

export function GropyPnlChart({ points }: { points: readonly PnlPoint[] }) {
  const model = buildGropyPnlChart(points);
  if (!model) return null;
  const tone = model.end > 0 ? styles.good : model.end < 0 ? styles.bad : styles.flat;
  const withYear = etYear(model.startAt) !== etYear(model.endAt);
  const start = etStamp(model.startAt, withYear);
  const end = etStamp(model.endAt, withYear);

  return (
    <figure className={`${styles.chartCard} desk-block`}>
      <div className={styles.chartHead}>
        <div>
          <p className="kicker">Bot PnL</p>
          <h1>gropy</h1>
        </div>
        <p className={`${styles.pnlFigure} ${tone}`}>{fmtSol(model.end, true)}</p>
      </div>
      <div className={styles.plot} role="img" aria-label={model.aria}>
        <div className={styles.yAxis} aria-hidden="true">
          {model.ticks.map((tick) => (
            <span key={tick.value} style={{ top: `${(tick.y / model.height) * 100}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${model.width} ${model.height}`} className={styles.svg}>
          {model.ticks.map((tick) => (
            <line
              key={tick.value}
              x1="8"
              x2={model.width - 8}
              y1={tick.y}
              y2={tick.y}
              className={Math.abs(tick.value) < 0.0000005 ? styles.zero : styles.gridLine}
            />
          ))}
          <path d={model.area} className={`${styles.area} ${tone}`} />
          <path d={model.line} pathLength={1} className={`${styles.line} ${tone} equity-line`} />
        </svg>
      </div>
      <div className={styles.times} aria-hidden="true">
        <span className={styles.timeSpacer} />
        <span className={styles.timeRow}>
          <span>
            <b>{start.date}</b>
            <span>{start.time} ET</span>
          </span>
          <span>
            <b>{end.date}</b>
            <span>{end.time} ET</span>
          </span>
        </span>
      </div>
      {model.flat ? <p className={styles.note}>No copy has closed, so the line sits at 0 SOL.</p> : null}
    </figure>
  );
}
