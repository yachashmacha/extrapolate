import { clampTicketAmounts } from "@/lib/analysis/bounds";
import { EquityChart } from "@/components/equity-chart";
import { fmtPct, fmtRate, fmtUsd } from "@/lib/format";
import type { Analysis } from "@/lib/types";

export function HomePreview({
  analysis,
  kicker,
  detail,
  ticketUsd,
}: {
  analysis: Analysis;
  kicker: string;
  detail: string;
  ticketUsd?: number;
}) {
  const fit = (text: string | undefined) =>
    text && ticketUsd && ticketUsd > 0 ? clampTicketAmounts(text, ticketUsd) : text;
  const fix = analysis.fixes[0];
  const keep = analysis.keeps.find((card) => card.category === "narrative") ?? analysis.keeps[0];
  return (
    <section className="section" aria-labelledby="live-reading">
      <div className="section-head">
        <div>
          <p className="kicker">{kicker}</p>
          <h2 id="live-reading">Your trades</h2>
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
          <h3>{fit(fix?.title)}</h3>
          <p className="rule">{fit(fix?.rule)}</p>
          <p className="kicker" style={{ marginTop: 16 }}>Keep doing</p>
          <h3>{fit(keep?.title)}</h3>
          <p>{fit(keep?.rule)}</p>
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
