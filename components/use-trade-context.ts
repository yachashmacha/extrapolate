"use client";

import { useEffect, useMemo, useState } from "react";
import { applyVerifiedTape, tapeForMint } from "@/lib/analysis/coin-stats";
import type { BiasRead, BiasTrade } from "@/lib/ingest/bias-context";
import type { Book, RoundTrip } from "@/lib/types";
import { useHighs } from "@/components/use-highs";

export function useTradeContext(book: Book | null, trades: RoundTrip[]): { trades: RoundTrip[]; pending: boolean } {
  const { tapes, pending: pendingHighs } = useHighs(book);
  const { reads, pending: pendingBias } = useBiasContext(book, trades);
  const merged = useMemo(
    () =>
      trades.map((trade) => {
        const read = reads[trade.id];
        const next: RoundTrip = { ...trade };
        if (typeof read?.volumeDroppedAfter === "boolean") next.volumeDroppedAfter = read.volumeDroppedAfter;
        if (typeof read?.mcDroppedAfter === "boolean") next.mcDroppedAfter = read.mcDroppedAfter;
        return applyVerifiedTape(next, tapeForMint(tapes, trade.mint));
      }),
    [trades, tapes, reads],
  );
  return { trades: merged, pending: pendingHighs || pendingBias };
}

function useBiasContext(book: Book | null, trades: RoundTrip[]): { reads: Record<string, BiasRead>; pending: boolean } {
  const [reads, setReads] = useState<Record<string, BiasRead>>({});
  const [pending, setPending] = useState(false);
  const payload = JSON.stringify(
    trades.map((trade) => ({
      id: trade.id,
      mint: trade.mint,
      entryAt: trade.entryAt,
      entryMarketCapUsd: trade.entryMarketCapUsd,
    })),
  );

  useEffect(() => {
    const rows = JSON.parse(payload) as BiasTrade[];
    if (!book || rows.length === 0) {
      setReads({});
      setPending(false);
      return;
    }
    const controller = new AbortController();
    setPending(true);
    fetch("/api/bias-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trades: rows }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as { reads?: Record<string, BiasRead> };
        if (!response.ok) throw new Error("bias");
        setReads(body.reads ?? {});
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setReads({});
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [book, payload]);

  return { reads, pending };
}
