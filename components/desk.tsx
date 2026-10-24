"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Mark } from "@/components/mark";
import { Reading } from "@/components/reading";
import { Tape } from "@/components/tape";
import { analyze } from "@/lib/analysis/engine";
import { isWalletAddress } from "@/lib/address";
import { sampleBook } from "@/lib/ingest/demo";
import { isTerminalId, terminalName } from "@/lib/terminals";
import type { Book, KolTag, MetaId, TerminalId } from "@/lib/types";
import { fmtUsdPlain, shortAddress } from "@/lib/format";

interface Overrides {
  kols: Record<string, KolTag[]>;
  metas: Record<string, MetaId[]>;
}

const EMPTY: Overrides = { kols: {}, metas: {} };

export function Desk() {
  const params = useSearchParams();
  const demo = params.get("demo") === "1";
  const source = params.get("source");
  const address = params.get("address") ?? "";
  const depth = params.get("depth") ?? "200";
  const terminal: TerminalId = isTerminalId(params.get("terminal")) ? (params.get("terminal") as TerminalId) : "axiom";
  const bookKey = demo ? "sample" : source === "csv" ? "csv" : address || "unknown";

  const [book, setBook] = useState<Book | null>(() => (demo ? sampleBook(terminal) : null));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!demo && source !== "csv");
  const [overrides, setOverrides] = useState<Overrides>(EMPTY);
  const [focus, setFocus] = useState<{ ids: string[]; label: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem(`extrapolate:overrides:${bookKey}`);
    try {
      setOverrides(raw ? (JSON.parse(raw) as Overrides) : EMPTY);
    } catch {
      setOverrides(EMPTY);
    }
    setFocus(null);
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
        return;
      }
      setBook(JSON.parse(raw) as Book);
      setError("");
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
    fetch(`/api/book?address=${encodeURIComponent(address)}&terminal=${terminal}&depth=${encodeURIComponent(depth)}`, { signal: controller.signal })
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

  const analysis = useMemo(() => analyze(trades, terminal), [trades, terminal]);
  const shown = focus ? analysis.trades.filter((trade) => focus.ids.includes(trade.id)) : analysis.trades;

  function update(id: string, patch: { kols?: KolTag[]; metas?: MetaId[] }) {
    const next: Overrides = {
      kols: patch.kols ? { ...overrides.kols, [id]: patch.kols } : overrides.kols,
      metas: patch.metas ? { ...overrides.metas, [id]: patch.metas } : overrides.metas,
    };
    setOverrides(next);
    localStorage.setItem(`extrapolate:overrides:${bookKey}`, JSON.stringify(next));
  }

  const title = book?.source === "sample" ? "Sample book" : book?.source === "csv" ? "Imported book" : shortAddress(address);

  return (
    <main className="shell desk">
      <header className="desk-bar">
        <Link className="wordmark" href="/">
          <Mark />
          extrapolate
        </Link>
        <div className="who">
          <strong>{title}</strong>
          <div className="note">
            {terminalName(terminal)}
            {book ? ` · ${analysis.summary.trades} closed · ${analysis.summary.spanLabel}` : ""}
            {book?.source === "wallet" ? (
              <>
                {" · "}
                <button type="button" className="texty" onClick={() => setReloadKey((value) => value + 1)}>Reread</button>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <nav className="index" aria-label="Desk sections">
        <a href="#split">Split</a>
        <a href="#curve">Equity</a>
        <a href="#patterns">Shared</a>
        <a href="#fixes">Leaks</a>
        <a href="#keeps">Edge</a>
        <a href="#people">KOLs</a>
        <a href="#checklist">Rules</a>
        <a href="#tape">Tape</a>
      </nav>

      {loading ? <p className="loading">Reading signatures, rebuilding round trips, and comparing the winners with the losers.</p> : null}
      {error ? (
        <div className="section">
          <p className="error">{error}</p>
          <p className="note">A public RPC only sees recent transactions, and some wallets trade through a different address than the vault. The sample book is a full reading you can open while you sort the wallet out.</p>
          <p><Link className="primary" href={`/desk?demo=1&terminal=${terminal}`}>Open the sample book</Link></p>
        </div>
      ) : null}

      {book && !loading ? (
        <>
          {book.source === "sample" ? (
            <p className="banner">Sample book of invented coins. The arithmetic is real. Your wallet is not in these numbers.</p>
          ) : null}
          {book.warnings.map((warning) => (
            <p key={warning} className="warn">{warning}</p>
          ))}
          {book.opens.length > 0 ? (
            <p className="warn">
              Still open, and left out of the win rate:{" "}
              {book.opens.map((open) => `${open.symbol} ${fmtUsdPlain(open.costUsd)} at ${open.entryMarketCapUsd > 0 ? `$${Math.round(open.entryMarketCapUsd / 1000)}k` : "an unknown cap"}`).join(" · ")}
            </p>
          ) : null}
          <Reading
            analysis={analysis}
            bookKey={bookKey}
            onShowTrades={(ids, label) => {
              setFocus({ ids, label });
              document.getElementById("tape")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          <Tape
            trades={shown}
            activeLabel={focus?.label ?? null}
            onClear={() => setFocus(null)}
            onChange={update}
          />
        </>
      ) : null}
    </main>
  );
}
