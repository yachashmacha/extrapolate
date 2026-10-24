"use client";

import { useState } from "react";
import { BookBar } from "@/components/book-bar";
import { BookError, BookNotices } from "@/components/book-notices";
import { Reading } from "@/components/reading";
import { Tape } from "@/components/tape";
import { useBook } from "@/components/use-book";

export function Desk() {
  const { book, analysis, error, loading, terminal, title, note, search, reread, update } = useBook();
  const [focus, setFocus] = useState<{ ids: string[]; label: string } | null>(null);
  const [focusSearch, setFocusSearch] = useState(search);
  if (focusSearch !== search) {
    setFocusSearch(search);
    setFocus(null);
  }
  const shown = focus ? analysis.trades.filter((trade) => focus.ids.includes(trade.id)) : analysis.trades;

  return (
    <main className="shell desk">
      <BookBar page="desk" title={title} note={note} search={search} onReread={reread} />
      <nav className="index" aria-label="Desk sections">
        <a href="#split">Split</a>
        <a href="#curve">Equity</a>
        <a href="#patterns">Shared</a>
        <a href="#fixes">Leaks</a>
        <a href="#keeps">Edge</a>
        <a href="#people">KOLs</a>
        <a href="#tape">Tape</a>
      </nav>

      {loading ? <p className="loading">Reading signatures, rebuilding round trips, and comparing the winners with the losers.</p> : null}
      {error ? <BookError error={error} terminal={terminal} /> : null}

      {book && !loading ? (
        <>
          <BookNotices book={book} />
          <Reading
            analysis={analysis}
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
