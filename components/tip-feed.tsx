"use client";

import { kolBoughtLine, type PracticeTip } from "@/lib/analysis/tips";
import { fmtMc, fmtPct, fmtUsd, fmtUsdPlain, fmtWhen } from "@/lib/format";

export function TipFeed({
  tips,
  selectedId,
  onSelect,
}: {
  tips: PracticeTip[];
  selectedId: string | null;
  onSelect: (tip: PracticeTip) => void;
}) {
  return (
    <div>
      <div className="section-head">
        <h2>Tips</h2>
        <p>One practice for each losing trade. The coin it was read from is on the card.</p>
      </div>
      {tips.length === 0 ? <p className="note">No losing trades in this book yet.</p> : null}
      <div className="feed-scroll">
        {tips.map((tip) => (
          <article key={tip.id} className={selectedId === tip.tradeId ? "trade panel picked" : "trade panel tip-card"}>
            <p className="kicker">From {tip.symbol}</p>
            <div className="recent-top">
              <span className="result-word bad">Loss</span>
              <span className="pnl bad">
                {fmtPct(tip.pnlPct)} <span className="trade-meta">{fmtUsd(tip.pnlUsd)}</span>
              </span>
            </div>
            <dl className="facts">
              <div className="fact">
                <dt>Bought at</dt>
                <dd>{fmtMc(tip.entryMarketCapUsd)}</dd>
              </div>
              <div className="fact">
                <dt>Size</dt>
                <dd>{fmtUsdPlain(tip.amountUsd)}</dd>
              </div>
              <div className="fact">
                <dt>KOL</dt>
                <dd>{kolBoughtLine(tip.kols)}</dd>
              </div>
            </dl>
            <p>{tip.tip}</p>
            <p className="note">{fmtWhen(tip.entryAt)} ET</p>
            <button type="button" className="ghost" onClick={() => onSelect(tip)} aria-pressed={selectedId === tip.tradeId}>
              Show {tip.symbol} on the tape
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
