"use client";

import { useMemo, useState } from "react";
import { bookBounds } from "@/lib/analysis/bounds";
import { tradingHabits } from "@/lib/analysis/habits";
import { BookBar } from "@/components/book-bar";
import { HabitFeed } from "@/components/habit-feed";
import { BookError, BookNotices } from "@/components/book-notices";
import { Reading } from "@/components/reading";
import { Tape } from "@/components/tape";
import { useBook } from "@/components/use-book";
import { useHighs } from "@/components/use-highs";
import { useRules } from "@/components/use-rules";

export function Desk() {
  const { book, analysis, error, loading, bookKey, title, note, search, reread, update, kolScan } = useBook();
  const { rules } = useRules(bookKey);
  const { highs, pending: pendingHighs } = useHighs(book);
  const bounds = useMemo(
    () => bookBounds({ trades: analysis.trades, rules, accountUsd: book?.accountUsd ?? null }),
    [analysis.trades, rules, book?.accountUsd],
  );
  const habitTrades = useMemo(
    () => analysis.trades.map((trade) => ({ ...trade, athMarketCapUsd: highs[trade.mint] || trade.athMarketCapUsd })),
    [analysis.trades, highs],
  );
  const habits = useMemo(() => tradingHabits(habitTrades, bounds), [habitTrades, bounds]);
  const activeRules = rules.filter((rule) => rule.active).length;
  const [focus, setFocus] = useState<{ ids: string[]; label: string; habitId?: string } | null>(null);
  const [focusSearch, setFocusSearch] = useState(search);
  if (focusSearch !== search) {
    setFocusSearch(search);
    setFocus(null);
  }
  const shown = focus ? analysis.trades.filter((trade) => focus.ids.includes(trade.id)) : analysis.trades;

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
          <Tape trades={shown} activeLabel={focus?.label ?? null} onClear={() => setFocus(null)} onChange={update} />
        </>
      ) : null}
    </main>
  );
}
