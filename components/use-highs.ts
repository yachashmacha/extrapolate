"use client";

import { useEffect, useState } from "react";
import type { VerifiedTape } from "@/lib/analysis/coin-stats";
import type { Book } from "@/lib/types";

export function useHighs(book: Book | null): { highs: Record<string, number>; tapes: Record<string, VerifiedTape>; pending: boolean } {
  const [highs, setHighs] = useState<Record<string, number>>({});
  const [tapes, setTapes] = useState<Record<string, VerifiedTape>>({});
  const [pending, setPending] = useState(false);
  const fetchedAt = book?.fetchedAt ?? "";
  const source = book?.source;

  useEffect(() => {
    if (!book || source !== "wallet") {
      setHighs({});
      setTapes({});
      setPending(false);
      return;
    }
    const seeded: Record<string, number> = {};
    for (const trade of book.trades) {
      if ((trade.athMarketCapUsd ?? 0) > 0) seeded[trade.mint] = trade.athMarketCapUsd ?? 0;
    }
    setHighs(seeded);
    setTapes({});
    const mints = [...new Set(book.trades.map((trade) => trade.mint))];
    if (mints.length === 0) {
      setPending(false);
      return;
    }
    const controller = new AbortController();
    setPending(true);
    fetch("/api/highs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mints }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as { highs?: Record<string, number>; tapes?: Record<string, VerifiedTape> };
        if (!response.ok) throw new Error("highs");
        setHighs({ ...seeded, ...(body.highs ?? {}) });
        setTapes(body.tapes ?? {});
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setHighs(seeded);
        setTapes({});
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [book, fetchedAt, source]);

  return { highs, tapes, pending };
}
