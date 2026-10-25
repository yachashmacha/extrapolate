"use client";

import { useEffect, useMemo, useState } from "react";
import type { BiasRead, BiasTrade } from "@/lib/ingest/bias-context";
import type { Book, RoundTrip } from "@/lib/types";
import { useHighs } from "@/components/use-highs";

export function useTradeContext(book: Book | null, trades: RoundTrip[]): { trades: RoundTrip[]; pending: boolean } {
  const { highs, pending: pendingHighs } = useHighs(book);
  const { reads, pending: pendingBias } = useBiasContext(book, trades);
  const merged = useMemo(
    () =>
      trades.map((trade) => {
        const read = reads[trade.id];
        const next: RoundTrip = { ...trade, athMarketCapUsd: highs[trade.mint] || trade.athMarketCapUsd };
        if (!read) return next;
        if ((read.graduationMarketCapUsd ?? 0) > 0) next.graduationMarketCapUsd = read.graduationMarketCapUsd;
        if (typeof read.volumeFalling === "boolean") next.volumeFalling = read.volumeFalling;
        return next;
      }),
    [trades, highs, reads],
  );
  return { trades: merged, pending: pendingHighs || pendingBias };
}

function useBiasContext(book: Book | null, trades: RoundTrip[]): { reads: Record<string, BiasRead>; pending: boolean } {
  const [reads, setReads] = useState<Record<string, BiasRead>>({});
  const [pending, setPending] = useState(false);
  const payload = JSON.stringify(
    trades
      .filter((trade) => trade.mint.endsWith("pump"))
      .map((trade) => ({
        id: trade.id,
        mint: trade.mint,
        entryAt: trade.entryAt,
        entryMarketCapUsd: trade.entryMarketCapUsd,
      })),
  );

  useEffect(() => {
    const pump = JSON.parse(payload) as BiasTrade[];
    if (!book || pump.length === 0) {
      setReads({});
      setPending(false);
      return;
    }
    const controller = new AbortController();
    setPending(true);
    fetch("/api/bias-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trades: pump }),
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
