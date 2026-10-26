"use client";

import { clampTicketAmounts, type BookBounds } from "@/lib/analysis/bounds";
import { fmtCoin, fmtRate, fmtUsd, fmtUsdPlain } from "@/lib/format";
import type { Analysis, AnnotatedTrade, PlayCard } from "@/lib/types";

const CATEGORY: Record<PlayCard["category"], string> = {
  entry: "Entry",
  size: "Size",
  callers: "KOLs",
  narrative: "Narrative",
  behavior: "Session",
};

export function Suggestions({
  analysis,
  bounds,
  onShowTrades,
}: {
  analysis: Analysis;
  bounds?: BookBounds;
  onShowTrades: (ids: string[], label: string) => void;
}) {
  const fit = (text: string) => (bounds && bounds.ticketUsd > 0 ? clampTicketAmounts(text, bounds.ticketUsd) : text);
  return (
    <section className="section" id="suggestions">
      <div className="section-head">
        <h2>From the losers</h2>
        <p>These cards compare the red trades with the green ones in this book. They are a reading of this book. The rule list below starts with the three base rules. Add to it, or turn one off.</p>
      </div>
      {analysis.fixes.length === 0 ? (
        <p className="note">{analysis.thin ? "Suggestions wait for 8 closed trades." : "No leak cleared the sample bar."}</p>
      ) : (
        <div className="play-grid">
          {analysis.fixes.map((play) => (
            <article key={play.id} className="play fix">
              <p className="kicker">{CATEGORY[play.category]}</p>
              <h3>{fit(play.title)}</h3>
              <p className="rule">{fit(play.rule)}</p>
              <p className="evidence">{play.evidence}</p>
              <SourceLine trades={analysis.trades} ids={play.tradeIds} />
              <ol>
                {play.steps.map((step) => (
                  <li key={step}>{fit(step)}</li>
                ))}
              </ol>
              <button type="button" className="ghost" onClick={() => onShowTrades(play.tradeIds, play.title)}>
                Show {play.sample} trades · {fmtRate(play.winRate)} hit rate · {fmtUsd(play.netPnlUsd)}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SourceLine({ trades, ids }: { trades: AnnotatedTrade[]; ids: string[] }) {
  const source = trades
    .filter((trade) => ids.includes(trade.id) && trade.result === "loss")
    .sort((left, right) => left.pnlUsd - right.pnlUsd)[0];
  if (!source) return null;
  const bought = source.entryMarketCapUsd > 0 ? fmtCoin(source.entryMarketCapUsd) : "an unknown market cap";
  return (
    <p className="note">
      From {source.symbol}, a {fmtUsd(source.pnlUsd)} loss, {fmtUsdPlain(source.amountUsd)} bought at {bought}.
    </p>
  );
}
