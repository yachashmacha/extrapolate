"use client";

import type { BookBounds } from "@/lib/analysis/bounds";
import { kolBoughtLine, type PracticeTip } from "@/lib/analysis/tips";
import { fmtMc, fmtPct, fmtUsd, fmtUsdPlain, fmtWhen } from "@/lib/format";

export function TipFeed({
  tips,
  bounds,
  activeRules,
  selectedId,
  onSelect,
}: {
  tips: PracticeTip[];
  bounds: BookBounds;
  activeRules: number;
  selectedId: string | null;
  onSelect: (tip: PracticeTip) => void;
}) {
  const sized = bounds.accountUsd
    ? `the ${fmtUsdPlain(bounds.accountUsd)} in this wallet`
    : "the winning tickets in this book";
  const rules =
    activeRules > 0
      ? ` Your ${activeRules} active ${activeRules === 1 ? "rule is" : "rules are"} part of the size.`
      : " No active rules are changing that size.";
  return (
    <div>
      <div className="section-head">
        <h2>Tips</h2>
        <p>
          One practice for each losing trade, sized from {sized}.{rules} A caller in the coin leaves that size where it is.
        </p>
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
