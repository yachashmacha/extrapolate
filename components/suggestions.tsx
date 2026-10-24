"use client";

import { fmtRate, fmtUsd } from "@/lib/format";
import type { Analysis, PlayCard } from "@/lib/types";

const CATEGORY: Record<PlayCard["category"], string> = {
  entry: "Entry",
  size: "Size",
  callers: "KOLs",
  narrative: "Narrative",
  behavior: "Session",
};

export function Suggestions({
  analysis,
  onShowTrades,
}: {
  analysis: Analysis;
  onShowTrades: (ids: string[], label: string) => void;
}) {
  return (
    <section className="section" id="suggestions">
      <div className="section-head">
        <h2>From the losers</h2>
        <p>Practical changes read off the red trades. They stay as a reading. Your rule list below stays blank until you write it.</p>
      </div>
      {analysis.fixes.length === 0 ? (
        <p className="note">{analysis.thin ? "Suggestions wait for 8 closed trades." : "No leak cleared the sample bar."}</p>
      ) : (
        <div className="play-grid">
          {analysis.fixes.map((play) => (
            <article key={play.id} className="play fix">
              <p className="kicker">{CATEGORY[play.category]}</p>
              <h3>{play.title}</h3>
              <p className="rule">{play.rule}</p>
              <p className="evidence">{play.evidence}</p>
              <ol>
                {play.steps.map((step) => (
                  <li key={step}>{step}</li>
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
