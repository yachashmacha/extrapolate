import { RATIONALITY_NOTE, type DayFill, type DayReport } from "@/lib/analysis/day-report";
import { NarrativeLine } from "@/components/narrative-line";
import { fmtUsd, fmtUsdPlain } from "@/lib/format";

export function DayReportPanel({ report }: { report: DayReport }) {
  const band = report.score == null ? "empty" : report.score >= 80 ? "high" : report.score >= 50 ? "mid" : "low";
  const scoreLabel = report.score == null ? "No rationality score" : `Rationality ${report.score} percent`;
  return (
    <section className="section eod" id="daily-report" data-day={report.dayKey} aria-label="End of day report">
      <div className="eod-top">
        <p className={`eod-score ${band}`} aria-label={scoreLabel}>
          <b className="num">{report.score == null ? "—" : `${report.score}%`}</b>
        </p>
        <div className="eod-title">
          <p className="kicker">End of day</p>
          <h2>{report.label}</h2>
          <p className="note">Eastern time{report.tradeCount > 0 ? ` · ${report.tradeCount} closed` : ""}</p>
        </div>
        <p className={pnlClass(report)}>
          {report.tradeCount === 0 ? "—" : fmtUsd(report.pnlUsd)}
        </p>
      </div>
      {report.score != null ? <p className="eod-why">{report.why}</p> : null}
      <p className="eod-read">{report.lead}</p>
      {report.sizeNote ? <p className="eod-read">{report.sizeNote}</p> : null}
      {report.tradeCount > 0 ? (
        <div className="eod-lists">
          <div>
            <h3>Best</h3>
            {report.noWinningTrade ? <p>No winning trade.</p> : null}
            {report.leastBad ? <p className="note">Best of a losing day, and still a loss.</p> : null}
            {report.leastBad ? <Fill fill={report.leastBad} /> : null}
            {report.best.map((fill) => (
              <Fill key={fill.id} fill={fill} />
            ))}
          </div>
          <div>
            <h3>Worst</h3>
            {report.worst.length === 0 ? <p>No losing trade.</p> : null}
            {report.worst.map((fill) => (
              <Fill key={fill.id} fill={fill} />
            ))}
          </div>
        </div>
      ) : null}
      {report.score != null ? <p className="note eod-note">{RATIONALITY_NOTE}</p> : null}
    </section>
  );
}

function Fill({ fill }: { fill: DayFill }) {
  return (
    <div className="eod-fill">
      <div>
        <div className="symbol">{fill.symbol}</div>
        <div className="note">{fmtUsdPlain(fill.amountUsd)}</div>
        <NarrativeLine score={fill.narrativeScore} line={fill.narrative} />
        {fill.note ? <div className="note">{fill.note}</div> : null}
      </div>
      <div className={fill.pnlUsd > 0 ? "eod-amt good num" : "eod-amt bad num"}>{fmtUsd(fill.pnlUsd)}</div>
    </div>
  );
}

function pnlClass(report: DayReport): string {
  if (report.tradeCount === 0) return "eod-pnl num";
  return report.pnlUsd >= 0 ? "eod-pnl num good" : "eod-pnl num bad";
}
