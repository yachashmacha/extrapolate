"use client";

import { useEffect, useState } from "react";
import type { Book } from "@/lib/types";

export function useHighs(book: Book | null): { highs: Record<string, number>; pending: boolean } {
  const [highs, setHighs] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const fetchedAt = book?.fetchedAt ?? "";
  const source = book?.source;

  useEffect(() => {
    if (!book || source !== "wallet") {
      setHighs({});
      setPending(false);
      return;
    }
    const seeded: Record<string, number> = {};
    for (const trade of book.trades) {
      if ((trade.athMarketCapUsd ?? 0) > 0) seeded[trade.mint] = trade.athMarketCapUsd ?? 0;
    }
    setHighs(seeded);
    const mints = [...new Set(book.trades.map((trade) => trade.mint))].filter((mint) => !seeded[mint]);
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
        const body = (await response.json()) as { highs?: Record<string, number> };
        if (!response.ok) throw new Error("highs");
        setHighs({ ...seeded, ...(body.highs ?? {}) });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setHighs(seeded);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [book, fetchedAt, source]);

  return { highs, pending };
}
