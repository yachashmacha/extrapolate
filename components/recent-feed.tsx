"use client";

import { useState } from "react";
import { NarrativeLine } from "@/components/narrative-line";
import { describeVerifiedTape } from "@/lib/analysis/coin-stats";
import { narrativeScore } from "@/lib/analysis/narrative";
import { kolBoughtLine } from "@/lib/analysis/tips";
import { fmtCoin, fmtPct, fmtUsd, fmtUsdPlain, fmtWhen } from "@/lib/format";
import type { AnnotatedTrade, RoundTrip } from "@/lib/types";

const PREVIEW = 12;

export function RecentFeed({
  trades,
  selectedId,
  onSelect,
  ruleNote,
  allTrades,
}: {
  trades: AnnotatedTrade[];
  selectedId: string | null;
  onSelect: (trade: AnnotatedTrade) => void;
  ruleNote?: (trade: AnnotatedTrade) => string;
  /** Full book, so the narrative can use earlier coins in the same tag. */
  allTrades?: RoundTrip[];
}) {
  const [expanded, setExpanded] = useState(false);
  const recent = [...trades].sort((left, right) => right.exitAt.localeCompare(left.exitAt));
  const shown = expanded ? recent : recent.slice(0, PREVIEW);

  return (
    <div>
      <div className="section-head">
        <h2>Recent trades</h2>
        <p>Newest close first. Each row has the market cap bought, the size, the result, the name of each KOL in that coin, and the narrative score.</p>
      </div>
      {recent.length === 0 ? <p className="note">No closed trades yet.</p> : null}
      <div className="feed-scroll">
        {shown.map((trade) => {
          const win = trade.result === "win";
          const narrative = narrativeScore(trade, allTrades ?? trades);
          const tapeLine = describeVerifiedTape(trade);
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
                    <dd>{fmtCoin(trade.entryMarketCapUsd)}</dd>
                  </div>
                  <div className="fact">
                    <dt>Size</dt>
                    <dd>{fmtUsdPlain(trade.amountUsd)}</dd>
                  </div>
                  <div className="fact">
                    <dt>KOL</dt>
                    <dd>{kolBoughtLine(trade.kols)}</dd>
                  </div>
                  {tapeLine ? (
                    <div className="fact">
                      <dt>Tape</dt>
                      <dd>{tapeLine}</dd>
                    </div>
                  ) : null}
                  <div className="fact">
                    <dt>Narrative</dt>
                    <dd>
                      <NarrativeLine score={narrative.score} line={narrative.line} />
                    </dd>
                  </div>
                </dl>
                <span className="note">{fmtWhen(trade.exitAt)} ET</span>
                {ruleNote?.(trade) ? <span className="note">{ruleNote(trade)}</span> : null}
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
