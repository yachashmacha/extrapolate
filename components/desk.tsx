"use client";

import { useMemo, useState } from "react";
import { AnalysingDay } from "@/components/analysing-day";
import { bookBounds } from "@/lib/analysis/bounds";
import { tradingHabits } from "@/lib/analysis/habits";
import { copyVerifiedTape } from "@/lib/analysis/coin-stats";
import { analyze } from "@/lib/analysis/engine";
import { withStoredHigh } from "@/lib/analysis/narrative";
import { BookBar } from "@/components/book-bar";
import { HabitFeed } from "@/components/habit-feed";
import { BookError, BookNotices } from "@/components/book-notices";
import { Reading } from "@/components/reading";
import { Tape } from "@/components/tape";
import { useBook } from "@/components/use-book";
import { useRules } from "@/components/use-rules";
import { useTradeContext } from "@/components/use-trade-context";
import { deskDayName, deskTradesForDay, isSelectableDeskDay, todayKeyEt } from "@/lib/desk-day";
import { ruleBreak } from "@/lib/rules";
import { terminalName } from "@/lib/terminals";
import type { AnnotatedTrade } from "@/lib/types";

export function Desk() {
  const { book, analysis, error, loading, bookKey, title, note, search, reread, update, kolScan } = useBook();
  const { rules } = useRules(bookKey);
  const today = todayKeyEt();
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked != null && isSelectableDeskDay(picked) ? picked : today;
  const { trades: habitTrades, pending: pendingHighs } = useTradeContext(book, analysis.trades);
  const dayTrades = useMemo(() => deskTradesForDay(habitTrades, selected), [habitTrades, selected]);
  const dayAnalysis = useMemo(
    () => analyze(dayTrades, book?.terminal ?? "wallet"),
    [dayTrades, book?.terminal],
  );
  const bounds = useMemo(
    () => bookBounds({ trades: analysis.trades, rules, accountUsd: book?.accountUsd ?? null, cashUsd: book?.cashUsd ?? null }),
    [analysis.trades, rules, book?.accountUsd, book?.cashUsd],
  );
  const habits = useMemo(
    () => tradingHabits(dayTrades, bounds, habitTrades),
    [dayTrades, bounds, habitTrades],
  );
  const activeRules = rules.filter((rule) => rule.active).length;
  const [focus, setFocus] = useState<{ ids: string[]; label: string; habitId?: string } | null>(null);
  const [focusSearch, setFocusSearch] = useState(search);
  const [focusDay, setFocusDay] = useState(selected);
  if (focusSearch !== search || focusDay !== selected) {
    setFocusSearch(search);
    setFocusDay(selected);
    setFocus(null);
  }
  const contextual = useMemo(() => {
    const marked = withStoredHigh(dayAnalysis.trades, dayTrades);
    const byId = new Map(dayTrades.map((trade) => [trade.id, trade]));
    return marked.map((trade) => copyVerifiedTape(trade, byId.get(trade.id)));
  }, [dayAnalysis.trades, dayTrades]);
  const dayNote = book
    ? `${terminalName(book.terminal)} · ${dayAnalysis.summary.trades} closed · ${selected === today ? "Today" : deskDayName(selected)}`
    : note;
  const shown = focus ? contextual.filter((trade) => focus.ids.includes(trade.id)) : contextual;
  const ruleNote = (trade: AnnotatedTrade) =>
    ruleBreak(trade, analysis.trades, {
      rules,
      accountUsd: book?.accountUsd ?? null,
      cashUsd: book?.cashUsd ?? null,
      opens: book?.opens,
    }).note;

  const hasCloses = dayAnalysis.summary.trades > 0;

  return (
    <main className="shell desk">
      <BookBar page="desk" title={title} note={dayNote} search={search} onReread={reread} />
      <AnalysingDay dayKey={selected} onSelect={setPicked} />
      {loading ? <p className="loading">Reading signatures, rebuilding closed trades, and comparing the winners with the losers.</p> : null}
      {error ? <BookError error={error} /> : null}

      {book && !loading ? (
        <>
          <BookNotices book={book} />
          <HabitFeed
            habits={habits}
            bounds={bounds}
            activeRules={activeRules}
            pendingHighs={pendingHighs}
            selectedId={focus?.habitId ?? null}
            onSelect={(habit) => {
              setFocus((current) =>
                current?.habitId === habit.id ? null : { ids: habit.tradeIds, label: habit.title, habitId: habit.id },
              );
              document.getElementById("tape")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          {hasCloses ? (
            <Reading
              analysis={dayAnalysis}
              ticketUsd={bounds.ticketUsd}
              kolScan={kolScan}
              onShowTrades={(ids, label) => {
                setFocus({ ids, label });
                document.getElementById("tape")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          ) : (
            <p className="note analysing-empty">No closed trades on this day.</p>
          )}
          <Tape trades={shown} allTrades={habitTrades} activeLabel={focus?.label ?? null} onClear={() => setFocus(null)} onChange={update} ruleNote={ruleNote} />
        </>
      ) : null}
    </main>
  );
}
