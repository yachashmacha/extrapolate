"use client";

import { useMemo, useState } from "react";
import { bookBounds } from "@/lib/analysis/bounds";
import { tradingHabits } from "@/lib/analysis/habits";
import { withStoredHigh } from "@/lib/analysis/narrative";
import { BookBar } from "@/components/book-bar";
import { HabitFeed } from "@/components/habit-feed";
import { BookError, BookNotices } from "@/components/book-notices";
import { Reading } from "@/components/reading";
import { Tape } from "@/components/tape";
import { useBook } from "@/components/use-book";
import { useRules } from "@/components/use-rules";
import { useTradeContext } from "@/components/use-trade-context";
import { ruleBreak } from "@/lib/rules";
import type { AnnotatedTrade } from "@/lib/types";

export function Desk() {
  const { book, analysis, error, loading, bookKey, title, note, search, reread, update, kolScan } = useBook();
  const { rules } = useRules(bookKey);
  const { trades: habitTrades, pending: pendingHighs } = useTradeContext(book, analysis.trades);
  const bounds = useMemo(
    () => bookBounds({ trades: analysis.trades, rules, accountUsd: book?.accountUsd ?? null, cashUsd: book?.cashUsd ?? null }),
    [analysis.trades, rules, book?.accountUsd, book?.cashUsd],
  );
  const habits = useMemo(() => tradingHabits(habitTrades, bounds), [habitTrades, bounds]);
  const activeRules = rules.filter((rule) => rule.active).length;
  const [focus, setFocus] = useState<{ ids: string[]; label: string; habitId?: string } | null>(null);
  const [focusSearch, setFocusSearch] = useState(search);
  if (focusSearch !== search) {
    setFocusSearch(search);
    setFocus(null);
  }
  const contextual = useMemo(() => withStoredHigh(analysis.trades, habitTrades), [analysis.trades, habitTrades]);
  const shown = focus ? contextual.filter((trade) => focus.ids.includes(trade.id)) : contextual;
  const ruleNote = (trade: AnnotatedTrade) =>
    ruleBreak(trade, analysis.trades, {
      rules,
      accountUsd: book?.accountUsd ?? null,
      cashUsd: book?.cashUsd ?? null,
      opens: book?.opens,
    }).note;

  return (
    <main className="shell desk">
      <BookBar page="desk" title={title} note={note} search={search} onReread={reread} />
      {loading ? <p className="loading">Reading signatures, rebuilding round trips, and comparing the winners with the losers.</p> : null}
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
          <Reading
            analysis={analysis}
            ticketUsd={bounds.ticketUsd}
            kolScan={kolScan}
            onShowTrades={(ids, label) => {
              setFocus({ ids, label });
              document.getElementById("tape")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          <Tape trades={shown} allTrades={contextual} activeLabel={focus?.label ?? null} onClear={() => setFocus(null)} onChange={update} ruleNote={ruleNote} />
        </>
      ) : null}
    </main>
  );
}
