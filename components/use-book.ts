"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { analyze } from "@/lib/analysis/engine";
import { isWalletAddress } from "@/lib/address";
import { bookSearch } from "@/lib/book-query";
import { sampleBook } from "@/lib/ingest/demo";
import { isTerminalId, terminalName } from "@/lib/terminals";
import type { Analysis, Book, KolTag, MetaId, TerminalId } from "@/lib/types";
import { shortAddress } from "@/lib/format";

export interface Overrides {
  kols: Record<string, KolTag[]>;
  metas: Record<string, MetaId[]>;
}

const EMPTY: Overrides = { kols: {}, metas: {} };

export function useBook() {
  const params = useSearchParams();
  const demo = params.get("demo") === "1";
  const source = params.get("source");
  const address = params.get("address") ?? "";
  const depth = params.get("depth") ?? "200";
  const terminal: TerminalId = isTerminalId(params.get("terminal")) ? (params.get("terminal") as TerminalId) : "axiom";
  const bookKey = demo ? "sample" : source === "csv" ? "csv" : address || "unknown";
  const search = bookSearch({ demo, source, address, terminal, depth });

  const [book, setBook] = useState<Book | null>(() => (demo ? sampleBook(terminal) : null));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!demo && source !== "csv");
  const [overrides, setOverrides] = useState<Overrides>(EMPTY);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem(`extrapolate:overrides:${bookKey}`);
    try {
      setOverrides(raw ? (JSON.parse(raw) as Overrides) : EMPTY);
    } catch {
      setOverrides(EMPTY);
    }
  }, [bookKey]);

  useEffect(() => {
    if (demo) {
      setBook(sampleBook(terminal));
      setError("");
      setLoading(false);
      return;
    }
    if (source === "csv") {
      const raw = sessionStorage.getItem("extrapolate:csv");
      if (!raw) {
        setError("The imported book is not in this tab anymore. Import the CSV again.");
        setBook(null);
        setLoading(false);
        return;
      }
      setBook(JSON.parse(raw) as Book);
      setError("");
      setLoading(false);
      return;
    }
    if (!isWalletAddress(address)) {
      setError("This desk link is missing a Solana address.");
      setBook(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/book?address=${encodeURIComponent(address)}&terminal=${terminal}&depth=${encodeURIComponent(depth)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not read that wallet.");
        setBook(body as Book);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setBook(null);
        setError(caught instanceof Error ? caught.message : "Could not read that wallet.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [demo, source, address, terminal, depth, reloadKey]);

  const trades = useMemo(() => {
    if (!book) return [];
    return book.trades.map((trade) => ({
      ...trade,
      kols: overrides.kols[trade.id] ?? trade.kols,
      metas: overrides.metas[trade.id] ?? trade.metas,
    }));
  }, [book, overrides]);

  const analysis: Analysis = useMemo(() => analyze(trades, terminal), [trades, terminal]);

  function update(id: string, patch: { kols?: KolTag[]; metas?: MetaId[] }) {
    const next: Overrides = {
      kols: patch.kols ? { ...overrides.kols, [id]: patch.kols } : overrides.kols,
      metas: patch.metas ? { ...overrides.metas, [id]: patch.metas } : overrides.metas,
    };
    setOverrides(next);
    localStorage.setItem(`extrapolate:overrides:${bookKey}`, JSON.stringify(next));
  }

  const title = book?.source === "sample" ? "Sample book" : book?.source === "csv" ? "Imported book" : shortAddress(address);
  const note = book
    ? `${terminalName(terminal)} · ${analysis.summary.trades} closed · ${analysis.summary.spanLabel}`
    : terminalName(terminal);

  return {
    book,
    analysis,
    error,
    loading,
    bookKey,
    terminal,
    title,
    note,
    search,
    address,
    update,
    reread: book?.source === "wallet" ? () => setReloadKey((value) => value + 1) : null,
  };
}
