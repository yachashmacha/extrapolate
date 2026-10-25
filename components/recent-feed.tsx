"use client";

import { useState } from "react";
import { kolBoughtLine } from "@/lib/analysis/tips";
import { fmtMc, fmtPct, fmtUsd, fmtUsdPlain, fmtWhen } from "@/lib/format";
import type { AnnotatedTrade } from "@/lib/types";

const PREVIEW = 12;

export function RecentFeed({
  trades,
  selectedId,
  onSelect,
}: {
  trades: AnnotatedTrade[];
  selectedId: string | null;
  onSelect: (trade: AnnotatedTrade) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const recent = [...trades].sort((left, right) => right.exitAt.localeCompare(left.exitAt));
  const shown = expanded ? recent : recent.slice(0, PREVIEW);

  return (
    <div>
      <div className="section-head">
        <h2>Recent trades</h2>
        <p>Newest close first. Each row has the market cap bought, the size, the result, and the name of each KOL in that coin.</p>
      </div>
      {recent.length === 0 ? <p className="note">No closed trades yet.</p> : null}
      <div className="feed-scroll">
        {shown.map((trade) => {
          const win = trade.result === "win";
          return (
            <article key={trade.id} id={`recent-${trade.id}`} className={selectedId === trade.id ? "trade panel picked" : "trade panel"}>
              <button type="button" className="recent-open" onClick={() => onSelect(trade)} aria-pressed={selectedId === trade.id}>
                <span className="recent-top">
                  <span className="symbol">{trade.symbol}</span>
                  <span className={win ? "result-word good" : "result-word bad"}>{win ? "Win" : "Loss"}</span>
                  <span className={win ? "pnl good" : "pnl bad"}>
                    {fmtPct(trade.pnlPct)} <span className="trade-meta">{fmtUsd(trade.pnlUsd)}</span>
                  </span>
                </span>
                <dl className="facts">
                  <div className="fact">
                    <dt>Bought at</dt>
                    <dd>{fmtMc(trade.entryMarketCapUsd)}</dd>
                  </div>
                  <div className="fact">
                    <dt>Size</dt>
                    <dd>{fmtUsdPlain(trade.amountUsd)}</dd>
                  </div>
                  <div className="fact">
                    <dt>KOL</dt>
                    <dd>{kolBoughtLine(trade.kols)}</dd>
                  </div>
                </dl>
                <span className="note">{fmtWhen(trade.exitAt)} ET</span>
              </button>
            </article>
          );
        })}
      </div>
      {recent.length > PREVIEW ? (
        <button type="button" className="texty" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show the latest" : `Show all ${recent.length}`}
        </button>
      ) : null}
    </div>
  );
}
