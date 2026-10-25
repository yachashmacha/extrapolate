import { fmtPct, fmtRate, fmtUsd } from "@/lib/format";
import type { Analysis } from "@/lib/types";
import { EquityChart } from "@/components/equity-chart";

export function HomePreview({ analysis, kicker, detail }: { analysis: Analysis; kicker: string; detail: string }) {
  const fix = analysis.fixes[0];
  const keep = analysis.keeps.find((card) => card.category === "narrative") ?? analysis.keeps[0];
  return (
    <section className="section" aria-labelledby="live-reading">
      <div className="section-head">
        <div>
          <p className="kicker">{kicker}</p>
          <h2 id="live-reading">The live book</h2>
        </div>
        <p>{detail}</p>
      </div>
      <p className="lede-block">{analysis.lede}</p>
      <div className="stat-row">
        <Stat label="Net" value={fmtUsd(analysis.summary.netPnlUsd)} tone={analysis.summary.netPnlUsd >= 0 ? "good" : "bad"} />
        <Stat label="Win rate" value={fmtRate(analysis.summary.winRate)} />
        <Stat label="Profit factor" value={analysis.summary.profitFactor?.toFixed(2) ?? "—"} />
        <Stat label="Avg win" value={fmtPct(analysis.summary.avgWinPct)} tone="good" />
        <Stat label="Avg loss" value={fmtPct(analysis.summary.avgLossPct)} tone="bad" />
      </div>
      <div className="preview-grid">
        <div className="panel">
          <p className="kicker">Closed equity</p>
          <EquityChart points={analysis.equity} />
        </div>
        <div className="panel">
          <p className="kicker">First fix</p>
          <h3>{fix?.title}</h3>
          <p className="rule">{fix?.rule}</p>
          <p className="kicker" style={{ marginTop: 16 }}>Keep doing</p>
          <h3>{keep?.title}</h3>
          <p>{keep?.rule}</p>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <b className={tone ? `${tone} num` : "num"}>{value}</b>
    </div>
  );
}
