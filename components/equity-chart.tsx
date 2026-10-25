import { buildEquityChart } from "@/lib/equity-scale";
import type { EquityPoint } from "@/lib/types";

export function EquityChart({ points }: { points: EquityPoint[] }) {
  const model = buildEquityChart(points);
  if (!model) return null;
  const tone = model.end >= 0 ? "good" : "bad";

  return (
    <div className={`equity-chart ${tone}`} role="img" aria-label={model.aria}>
      <div className="equity-scale" aria-hidden="true">
        {model.ticks.map((tick) => (
          <span key={tick.value} className={`equity-tick ${tick.tone}`} style={{ top: `${(tick.y / model.height) * 100}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
      <div className="equity-main">
        <svg
          className="equity"
          viewBox={`0 0 ${model.width} ${model.height}`}
          style={{ aspectRatio: `${model.width} / ${model.height}` }}
          aria-hidden="true"
        >
          {model.ticks.map((tick) => (
            <line
              key={tick.value}
              className={tick.tone === "zero" ? "zero" : "grid"}
              x1={model.plotLeft}
              x2={model.plotRight}
              y1={tick.y}
              y2={tick.y}
            />
          ))}
          <path className="area" d={model.area} />
          <path
            d={model.line}
            fill="none"
            stroke={tone === "good" ? "var(--sage)" : "var(--clay)"}
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="equity-overlay">
          {model.marks.map((mark) => (
            <span key={mark.roles.join("-")}>
              <span
                className={`equity-dot ${mark.pnl < 0 ? "bad" : mark.pnl > 0 ? "good" : ""}`}
                style={{ left: `${(mark.x / model.width) * 100}%`, top: `${(mark.y / model.height) * 100}%` }}
              />
              <span
                className={`equity-call ${mark.place}`}
                style={{ left: `${(mark.labelX / model.width) * 100}%`, top: `${(mark.y / model.height) * 100}%` }}
              >
                <em>{mark.kicker}</em>
                <strong className={mark.pnl < 0 ? "bad" : mark.pnl > 0 ? "good" : ""}>{mark.label}</strong>
                {mark.showAxisTime ? null : <span className="when">{mark.stamp.label}</span>}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="equity-times" aria-hidden="true">
        {model.marks
          .filter((mark) => mark.showAxisTime)
          .map((mark) => (
            <span
              key={mark.roles.join("-")}
              className={`equity-time ${mark.roles.includes("low") && !mark.roles.includes("start") && !mark.roles.includes("end") ? "low" : mark.roles.includes("end") ? "end" : "start"}`}
              style={{ left: `${(mark.x / model.width) * 100}%` }}
            >
              <b>{mark.stamp.date}</b>
              <span>{mark.stamp.time} ET</span>
            </span>
          ))}
      </div>
    </div>
  );
}
