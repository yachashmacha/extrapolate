"use client";

import { useEffect, useState } from "react";
import { fmtPct } from "@/lib/format";
import type { WeekBoard, WeekTicker } from "@/lib/news/week";
import styles from "./news.module.css";

const REFRESH_MS = 30_000;

export function WeekTape({ initial }: { initial: WeekBoard }) {
  const [board, setBoard] = useState(initial);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const response = await fetch("/api/news/week", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as WeekBoard;
        if (stop || !Array.isArray(next.tickers) || next.tickers.length === 0) return;
        setBoard((current) => ({
          tickers: next.tickers.filter(isTicker),
          loadedAt: typeof next.loadedAt === "string" ? next.loadedAt : current.loadedAt,
        }));
      } catch {
        // Keep the last board. A missed poll is not a new ranking.
      }
    }
    if (initial.tickers.length === 0) void pull();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void pull();
    }, REFRESH_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [initial.tickers.length]);

  const rising = board.tickers.filter((ticker) => ticker.changePct > 0);
  if (rising.length === 0) {
    return <p className={styles.weekMiss}>Nothing in the week’s top ten is up.</p>;
  }

  return (
    <section className={styles.week} aria-label="Coins up over the last seven days, pinned">
      <p className={styles.weekLabel}>7d</p>
      <div className={styles.weekWindow}>
        <div className={styles.weekTrack}>
          <WeekRow tickers={rising} />
          <WeekRow tickers={rising} hidden />
        </div>
      </div>
    </section>
  );
}

function WeekRow({ tickers, hidden = false }: { tickers: WeekTicker[]; hidden?: boolean }) {
  return (
    <ol className={hidden ? `${styles.weekRow} ${styles.weekGhost}` : styles.weekRow} aria-hidden={hidden || undefined}>
      {tickers.map((ticker, index) => (
        <li key={`${ticker.id}-${index}`} className={styles.weekItem}>
          <b>{ticker.symbol.length < 3 ? ticker.name : ticker.symbol}</b>
          <span className={ticker.changePct < 0 ? "bad num" : "good num"}>{fmtPct(ticker.changePct, 1)}</span>
        </li>
      ))}
    </ol>
  );
}

function isTicker(value: WeekTicker): value is WeekTicker {
  return Boolean(value && typeof value.id === "string" && typeof value.symbol === "string" && typeof value.changePct === "number" && typeof value.priceUsd === "number");
}
