"use client";

import { useEffect, useMemo, useState } from "react";
import { BookBar } from "@/components/book-bar";
import { BookError, BookNotices } from "@/components/book-notices";
import { PnlCalendar } from "@/components/pnl-calendar";
import { RuleBook } from "@/components/rule-book";
import { Suggestions } from "@/components/suggestions";
import { Tape } from "@/components/tape";
import { useBook } from "@/components/use-book";
import { currentMonthEt, dayKeyEt, dayLabel, monthOf } from "@/lib/calendar";

type FeedScope =
  | { kind: "month" }
  | { kind: "book" }
  | { kind: "day"; dayKey: string }
  | { kind: "suggestion"; ids: string[]; label: string };

export function Portfolio() {
  const { book, analysis, error, loading, bookKey, terminal, title, note, search, reread, update } = useBook();
  const latestMonth = useMemo(() => {
    const exits = analysis.trades.map((trade) => trade.exitAt).sort();
    return exits.length ? monthOf(dayKeyEt(exits[exits.length - 1])) : currentMonthEt();
  }, [analysis.trades]);
  const [month, setMonth] = useState<string | null>(null);
  const [scope, setScope] = useState<FeedScope>({ kind: "month" });
  const shownMonth = month ?? latestMonth;

  useEffect(() => {
    setMonth(null);
    setScope({ kind: "month" });
  }, [bookKey]);

  function selectDay(dayKey: string) {
    setMonth(monthOf(dayKey));
    setScope((current) => (current.kind === "day" && current.dayKey === dayKey ? { kind: "month" } : { kind: "day", dayKey }));
  }

  function showSuggestion(ids: string[], label: string) {
    setScope({ kind: "suggestion", ids, label });
    document.getElementById("feeds")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const scoped = analysis.trades.filter((trade) => {
    const day = dayKeyEt(trade.exitAt);
    if (scope.kind === "book") return true;
    if (scope.kind === "day") return day === scope.dayKey;
    if (scope.kind === "suggestion") return scope.ids.includes(trade.id);
    return day.startsWith(shownMonth);
  });

  return (
    <main className="shell desk">
      <BookBar page="portfolio" title={title} note={note} search={search} onReread={reread} />
      {loading ? <p className="loading">Reading signatures and building the month.</p> : null}
      {error ? <BookError error={error} terminal={terminal} /> : null}
      {book && !loading ? (
        <>
          <BookNotices book={book} />
          <PnlCalendar
            trades={analysis.trades}
            month={shownMonth}
            selectedDay={scope.kind === "day" ? scope.dayKey : null}
            onMonth={(next) => {
              setMonth(next);
              setScope({ kind: "month" });
            }}
            onSelectDay={selectDay}
          />
          <Suggestions analysis={analysis} onShowTrades={showSuggestion} />
          <section className="section" id="feeds">
            <div className="section-head">
              <h2>The tape</h2>
              <p>Winners on one side, losers on the other. Pick a day to review that session.</p>
            </div>
            <div className="filter-row">
              <button type="button" className="chip" aria-pressed={scope.kind === "month"} onClick={() => setScope({ kind: "month" })}>
                This month
              </button>
              <button type="button" className="chip" aria-pressed={scope.kind === "book"} onClick={() => setScope({ kind: "book" })}>
                Whole book
              </button>
              {scope.kind === "day" ? (
                <button type="button" className="chip" aria-pressed="true" onClick={() => setScope({ kind: "month" })}>
                  {dayLabel(scope.dayKey)} · clear
                </button>
              ) : null}
              {scope.kind === "suggestion" ? (
                <button type="button" className="chip" aria-pressed="true" onClick={() => setScope({ kind: "month" })}>
                  {scope.label} · clear
                </button>
              ) : null}
              <span className="note">{scoped.length} shown</span>
            </div>
            <div className="feeds">
              <div>
                <h3 className="feed-title">Winners</h3>
                <Tape trades={scoped} sideLock="win" showHeading={false} anchor="winners" activeLabel={null} onClear={() => setScope({ kind: "month" })} onChange={update} />
              </div>
              <div>
                <h3 className="feed-title">Losers</h3>
                <Tape trades={scoped} sideLock="loss" showHeading={false} anchor="losers" activeLabel={null} onClear={() => setScope({ kind: "month" })} onChange={update} />
              </div>
            </div>
          </section>
          <RuleBook bookKey={bookKey} />
        </>
      ) : null}
    </main>
  );
}
