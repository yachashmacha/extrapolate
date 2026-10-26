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

  if (board.tickers.length === 0) {
    return <p className={`note ${styles.weekMiss}`}>The week’s top ten did not come back on this read.</p>;
  }

  return (
    <section className={styles.week} aria-label="Week's top 10">
      <p className={styles.weekLabel}>Week&apos;s top 10</p>
      <div className={styles.weekWindow}>
        <div className={styles.weekTrack}>
          <WeekRow tickers={board.tickers} />
          <WeekRow tickers={board.tickers} hidden />
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
          <span className={`num ${styles.weekRank}`}>{index + 1}</span>
          <b>{ticker.symbol}</b>
          {ticker.symbol.length < 3 ? <span className={styles.weekPx}>{ticker.name}</span> : null}
          <span className={`num ${styles.weekPx}`}>{fmtTapePrice(ticker.priceUsd)}</span>
          <span className={ticker.changePct < 0 ? "bad num" : ticker.changePct > 0 ? "good num" : "num"}>
            {fmtPct(ticker.changePct, 1)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function isTicker(value: WeekTicker): value is WeekTicker {
  return Boolean(value && typeof value.id === "string" && typeof value.symbol === "string" && typeof value.changePct === "number" && typeof value.priceUsd === "number");
}

function fmtTapePrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const digits = value >= 0.01 ? 4 : value >= 0.0001 ? 6 : 8;
  const fixed = value.toFixed(digits);
  return `$${fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}`;
}
