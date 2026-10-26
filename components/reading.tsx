"use client";

import { clampTicketAmounts } from "@/lib/analysis/bounds";
import { EquityChart } from "@/components/equity-chart";
import { fmtHold, fmtMc, fmtRate, fmtUsd, fmtUsdPlain } from "@/lib/format";
import { kolLabel } from "@/lib/kols";
import type { Analysis, KolReport, Pattern, PlayCard, SidePortrait } from "@/lib/types";
import type { KolScanProgress } from "@/components/use-book";

const CATEGORY: Record<PlayCard["category"], string> = {
  entry: "Entry",
  size: "Size",
  callers: "KOLs",
  narrative: "Narrative",
  behavior: "Time of day",
};

export function Reading({
  analysis,
  ticketUsd,
  kolScan,
  onShowTrades,
}: {
  analysis: Analysis;
  ticketUsd?: number;
  kolScan?: KolScanProgress | null;
  onShowTrades: (ids: string[], label: string) => void;
}) {
  const { summary } = analysis;
  return (
    <>
      <p className="lede-block">{analysis.lede}</p>
      <div className="stat-row">
        <Stat label="Net" value={fmtUsd(summary.netPnlUsd)} tone={summary.netPnlUsd >= 0 ? "good" : "bad"} />
        <Stat label="Win rate" value={`${summary.wins}/${summary.trades} · ${fmtRate(summary.winRate)}`} />
        <Stat label="Profit factor" value={summary.profitFactor === null ? "No red" : summary.profitFactor.toFixed(2)} />
        <Stat label="Per trade" value={fmtUsd(summary.expectancyUsd)} tone={summary.expectancyUsd >= 0 ? "good" : "bad"} />
        <Stat label="Median hold" value={fmtHold(summary.medianHold)} />
      </div>

      <section className="section" id="split">
        <div className="section-head">
          <h2>The split</h2>
          <p>Medians, not averages. One huge loss cannot pretend to be the typical red trade.</p>
        </div>
        <div className="panel">
          <table className="compare">
            <thead>
              <tr>
                <th></th>
                <th>Winners · {analysis.comparison.winners.trades}</th>
                <th>Losers · {analysis.comparison.losers.trades}</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Net" win={fmtUsd(analysis.comparison.winners.netPnlUsd)} loss={fmtUsd(analysis.comparison.losers.netPnlUsd)} />
              <Row label="Median entry market cap" win={fmtMc(analysis.comparison.winners.medianEntryMc)} loss={fmtMc(analysis.comparison.losers.medianEntryMc)} />
              <Row label="Median size" win={fmtUsdPlain(analysis.comparison.winners.medianSize)} loss={fmtUsdPlain(analysis.comparison.losers.medianSize)} />
              <Row label="Median hold" win={fmtHold(analysis.comparison.winners.medianHold)} loss={fmtHold(analysis.comparison.losers.medianHold)} />
              <Row label="KOLs per trade" win={analysis.comparison.winners.avgKols.toFixed(1)} loss={analysis.comparison.losers.avgKols.toFixed(1)} />
              <Row label="Usual narrative" win={analysis.comparison.winners.topMeta} loss={analysis.comparison.losers.topMeta} />
              <Row label="Usual time" win={analysis.comparison.winners.topSession} loss={analysis.comparison.losers.topSession} />
              <Row label="Names that show up" win={names(analysis.comparison.winners)} loss={names(analysis.comparison.losers)} />
              <Row label="Median liquidity now" win={fmtMc(analysis.comparison.winners.medianLiquidity)} loss={fmtMc(analysis.comparison.losers.medianLiquidity)} />
              {analysis.comparison.winners.medianLaunchMin >= 0 || analysis.comparison.losers.medianLaunchMin >= 0 ? (
                <Row label="Median time from launch" win={fmtHold(analysis.comparison.winners.medianLaunchMin)} loss={fmtHold(analysis.comparison.losers.medianLaunchMin)} />
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" id="curve">
        <div className="section-head">
          <h2>Closed equity</h2>
          <p>Running PnL after each closed trade. Open coins stay off this line.</p>
        </div>
        <div className="panel">
          <EquityChart points={analysis.equity} />
        </div>
      </section>

      <section className="section" id="patterns">
        <div className="section-head">
          <h2>What they shared</h2>
          <p>A pattern shows up here when it covers the winners and skips the losers, or the other way around. The gap has to be at least 18 points, across at least four trades.</p>
        </div>
        {analysis.patterns.length === 0 ? (
          <p className="note">Not enough separation yet. Tag KOLs and narratives, or wait for more closed trades.</p>
        ) : (
          <div className="patterns">
            {analysis.patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} onShowTrades={onShowTrades} />
            ))}
          </div>
        )}
      </section>

      <section className="section" id="fixes">
        <div className="section-head">
          <h2>Where it goes wrong</h2>
          <p>Suggestions from the losing trades: entry, size, KOLs, narrative, and time of day. Each one names the trades it came from. Your rules live on Portfolio. Three start on, and you can add, edit, or turn them off.</p>
        </div>
        {analysis.fixes.length === 0 ? (
          <p className="note">{analysis.thin ? "Suggestions wait for 8 closed trades." : "Nothing in the losing trades stands out yet."}</p>
        ) : (
          <div className="play-grid">
            {analysis.fixes.map((play) => (
              <PlayCardView key={play.id} play={play} ticketUsd={ticketUsd} onShowTrades={onShowTrades} />
            ))}
          </div>
        )}
      </section>

      <section className="section" id="keeps">
        <div className="section-head">
          <h2>Where it goes right</h2>
          <p>Keep doing these. They are what already made money next to the losses above.</p>
        </div>
        {analysis.keeps.length === 0 ? (
          <p className="note">Not enough winning trades to lean on yet.</p>
        ) : (
          <div className="play-grid">
            {analysis.keeps.map((play) => (
              <PlayCardView key={play.id} play={play} ticketUsd={ticketUsd} onShowTrades={onShowTrades} />
            ))}
          </div>
        )}
      </section>

      <section className="section" id="people">
        <div className="table-grid">
          <div className="panel">
            <p className="kicker">KOLs</p>
            <h3>Who was in the coin</h3>
            <p className="note">
              Tracked wallets are checked for a buy of the same coin. The table shows the name. Before and with you count as already in. After does not.
              {kolScan?.pending
                ? ` Checked ${kolScan.checked.toLocaleString("en-US")} of ${kolScan.total.toLocaleString("en-US")}.`
                : ""}
            </p>
            <table className="data">
              <thead>
                <tr><th>KOL</th><th>Trades</th><th>Win rate</th><th>Net</th><th>Timing</th></tr>
              </thead>
              <tbody>
                {analysis.kols.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      {kolScan?.pending
                        ? "Checking tracked wallets. A match shows the name."
                        : "No tracked wallet bought these coins. Add a name from a trade."}
                    </td>
                  </tr>
                ) : (
                  analysis.kols.map((kol) => (
                    <tr key={kol.id} onClick={() => onShowTrades(kol.tradeIds, kolLabel(kol))}>
                      <td>
                        <KolName kol={kol} />
                      </td>
                      <td className="num">{kol.trades}</td>
                      <td className="num">{fmtRate(kol.winRate)}</td>
                      <td className={kol.netPnlUsd >= 0 ? "good num" : "bad num"}>{fmtUsd(kol.netPnlUsd)}</td>
                      <td>{kol.usualTiming}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <p className="kicker">Narratives</p>
            <h3>The meta the coin belonged to</h3>
            <p className="note">Guessed from the name on a live read. You can retag a trade when the guess is wrong.</p>
            <table className="data">
              <thead>
                <tr><th>Narrative</th><th>Trades</th><th>Win rate</th><th>Net</th><th>Median entry</th></tr>
              </thead>
              <tbody>
                {analysis.metas.map((meta) => (
                  <tr key={meta.id} onClick={() => onShowTrades(meta.tradeIds, meta.label)}>
                    <td>{meta.label}</td>
                    <td className="num">{meta.trades}</td>
                    <td className="num">{fmtRate(meta.winRate)}</td>
                    <td className={meta.netPnlUsd >= 0 ? "good num" : "bad num"}>{fmtUsd(meta.netPnlUsd)}</td>
                    <td className="num">{fmtMc(meta.medianEntryMc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </>
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

function Row({ label, win, loss }: { label: string; win: string; loss: string }) {
  return (
    <tr>
      <th>{label}</th>
      <td className="good">{win}</td>
      <td className="bad">{loss}</td>
    </tr>
  );
}

function KolName({ kol }: { kol: KolReport }) {
  return <span>{kolLabel(kol)}</span>;
}

function names(side: SidePortrait): string {
  return side.topKols.length > 0 ? side.topKols.join(", ") : "—";
}

function PatternCard({
  pattern,
  onShowTrades,
}: {
  pattern: Pattern;
  onShowTrades: (ids: string[], label: string) => void;
}) {
  return (
    <article className="pattern">
      <header>
        <span className="kicker">{pattern.side === "win" ? "Shared by winners" : "Shared by losers"}</span>
        <strong>{pattern.label}</strong>
      </header>
      <div className="share">
        <span>Winners</span>
        <div className="track"><span style={{ width: `${Math.round(pattern.winnerShare * 100)}%` }} /></div>
        <em className="num">{Math.round(pattern.winnerShare * 100)}%</em>
      </div>
      <div className="share">
        <span>Losers</span>
        <div className="track loss"><span style={{ width: `${Math.round(pattern.loserShare * 100)}%` }} /></div>
        <em className="num">{Math.round(pattern.loserShare * 100)}%</em>
      </div>
      <p className="note">{pattern.n} trades · {fmtRate(pattern.winRate)} wins · {fmtUsd(pattern.netPnlUsd)}</p>
      <button type="button" className="texty" onClick={() => onShowTrades(pattern.tradeIds, pattern.label)}>
        Show these trades
      </button>
    </article>
  );
}

function PlayCardView({
  play,
  ticketUsd,
  onShowTrades,
}: {
  play: PlayCard;
  ticketUsd?: number;
  onShowTrades: (ids: string[], label: string) => void;
}) {
  const fit = (text: string) => (ticketUsd && ticketUsd > 0 ? clampTicketAmounts(text, ticketUsd) : text);
  return (
    <article className={play.tone === "fix" ? "play fix" : "play keep"}>
      <p className="kicker">{play.tone === "fix" ? "Change this" : "Repeat this"} · {CATEGORY[play.category]}</p>
      <h3>{fit(play.title)}</h3>
      <p className="rule">{fit(play.rule)}</p>
      <p className="evidence">{play.evidence}</p>
      <ol>
        {play.steps.map((step, index) => (
          <li key={`${play.id}-${index}`}>{fit(step)}</li>
        ))}
      </ol>
      <button type="button" className="ghost" onClick={() => onShowTrades(play.tradeIds, play.title)}>
        Show {play.sample} trades · {fmtRate(play.winRate)} hit rate · {fmtUsd(play.netPnlUsd)}
      </button>
    </article>
  );
}

