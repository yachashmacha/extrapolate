"use client";

import { useState } from "react";
import { fmtHold, fmtMc, fmtPct, fmtUsd, fmtUsdPlain, fmtWhen } from "@/lib/format";
import { kolLabel, makeKol, searchKols } from "@/lib/kols";
import { META_LABEL, META_ORDER } from "@/lib/metas";
import type { AnnotatedTrade, KolTag, KolTiming, MetaId } from "@/lib/types";

export function Tape({
  trades,
  activeLabel,
  onClear,
  onChange,
  sideLock,
  showHeading = true,
  anchor = "tape",
  ruleNote,
}: {
  trades: AnnotatedTrade[];
  activeLabel: string | null;
  onClear: () => void;
  onChange: (id: string, patch: { kols?: KolTag[]; metas?: MetaId[] }) => void;
  sideLock?: "win" | "loss";
  showHeading?: boolean;
  anchor?: string;
  ruleNote?: (trade: AnnotatedTrade) => string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [side, setSide] = useState<"all" | "win" | "loss">(sideLock ?? "all");
  const visible = trades.filter((trade) => (sideLock ?? side) === "all" || trade.result === (sideLock ?? side));

  return (
    <section className={showHeading ? "section" : "section tape-embed"} id={anchor}>
      {showHeading ? (
        <div className="section-head">
          <h2>The tape</h2>
          <p>Open a fill to see how it sits against the winners. Callers show up by name.</p>
        </div>
      ) : null}
      <div className="filter-row">
        {sideLock
          ? null
          : (["all", "win", "loss"] as const).map((value) => (
              <button key={value} type="button" className="chip" aria-pressed={side === value} onClick={() => setSide(value)}>
                {value === "all" ? "All" : value === "win" ? "Winners" : "Losers"}
              </button>
            ))}
        {activeLabel ? (
          <button type="button" className="chip" aria-pressed="true" onClick={onClear}>
            {activeLabel} · clear
          </button>
        ) : null}
        <span className="note">{visible.length} shown</span>
      </div>
      {visible.length === 0 ? <p className="note">Nothing in this slice.</p> : null}
      {visible.map((trade) => (
        <article key={trade.id} className="trade panel">
          <button
            type="button"
            className="trade-main"
            aria-expanded={openId === trade.id}
            onClick={() => setOpenId(openId === trade.id ? null : trade.id)}
          >
            <span>
              <span className="symbol">{trade.symbol}</span>
              <span className="trade-meta"> {trade.metas.map((meta) => META_LABEL[meta]).join(" · ")}</span>
            </span>
            <span className="trade-meta">
              {fmtWhen(trade.entryAt)} ET · {fmtMc(trade.entryMarketCapUsd)} → {fmtMc(trade.exitMarketCapUsd)} · {fmtHold(trade.holdMinutes)} · {fmtUsdPlain(trade.amountUsd)}
              {trade.kols.length > 0
                ? ` · ${trade.kols
                    .slice(0, 2)
                    .map((kol) => kolLabel(kol))
                    .join(", ")}${trade.kols.length > 2 ? ` +${trade.kols.length - 2}` : ""}`
                : ""}
            </span>
            <span className={trade.pnlUsd >= 0 ? "pnl good" : "pnl bad"}>
              {fmtPct(trade.pnlPct)}
              <span className="trade-meta"> {fmtUsd(trade.pnlUsd)}</span>
            </span>
          </button>
          {ruleNote?.(trade) ? <p className="note">{ruleNote(trade)}</p> : null}
          {openId === trade.id ? (
            <div className="detail">
              <p>{trade.note}</p>
              <div className="tags">
                {trade.tags.map((tag) => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
                {trade.revenge ? <span className="tag">Revenge size</span> : null}
                <span className="tag keep">{trade.session}</span>
              </div>
              <div className="editor">
                <span className="label">Narrative</span>
                <div className="chip-row">
                  {META_ORDER.map((meta) => (
                    <button
                      key={meta}
                      type="button"
                      className="chip"
                      aria-pressed={trade.metas.includes(meta)}
                      onClick={() => onChange(trade.id, { metas: [meta] })}
                    >
                      {META_LABEL[meta]}
                    </button>
                  ))}
                </div>
              </div>
              <KolEditor trade={trade} onChange={onChange} />
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function KolEditor({
  trade,
  onChange,
}: {
  trade: AnnotatedTrade;
  onChange: (id: string, patch: { kols?: KolTag[]; metas?: MetaId[] }) => void;
}) {
  const [query, setQuery] = useState("");
  const hits = searchKols(query, 8);
  const present = new Set(trade.kols.map((kol) => kol.id));

  function setTiming(kol: KolTag, timing: KolTiming) {
    onChange(trade.id, {
      kols: trade.kols.map((item) => (item.id === kol.id ? { ...item, timing } : item)),
    });
  }

  function remove(id: string) {
    onChange(trade.id, { kols: trade.kols.filter((kol) => kol.id !== id) });
  }

  function add(id: string) {
    const next = makeKol(id, "before");
    if (trade.kols.some((kol) => kol.id === next.id)) return;
    onChange(trade.id, { kols: [...trade.kols, next] });
    setQuery("");
  }

  function addQuery() {
    const handle = query.trim().replace(/^@/, "");
    if (handle.length < 2) return;
    const named = hits.filter((kol) => kol.name.toLowerCase() === handle.toLowerCase());
    const wallet = hits.find((kol) => kol.wallet === handle);
    if (wallet) {
      add(wallet.wallet);
      return;
    }
    if (named.length === 1) {
      add(named[0].wallet);
      return;
    }
    if (hits.length > 0) return;
    add(handle);
  }

  return (
    <div className="editor">
      <span className="label">KOLs in this coin</span>
      <p className="note">Search the tracked list, or paste an address. The coin shows the name.</p>
      {trade.kols.length === 0 ? <p className="note">No tracked wallet is on this fill yet.</p> : null}
      <div className="kol-list">
        {trade.kols.map((kol) => (
          <div key={kol.id} className="kol-row">
            <button type="button" className="chip" aria-pressed="true" onClick={() => remove(kol.id)}>
              {kolLabel(kol)}
            </button>
            <select
              className="timing"
              aria-label={`${kolLabel(kol)} timing`}
              value={kol.timing}
              onChange={(event) => setTiming(kol, event.target.value as KolTiming)}
            >
              <option value="before">before you</option>
              <option value="with">with you</option>
              <option value="after">after you</option>
            </select>
          </div>
        ))}
      </div>
      <div className="actions">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or wallet"
          aria-label="Find a tracked KOL"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addQuery();
            }
          }}
        />
        <button type="button" className="ghost" onClick={addQuery}>
          Add KOL
        </button>
      </div>
      {hits.length > 0 ? (
        <ul className="kol-search">
          {hits.map((kol) => (
            <li key={kol.wallet}>
              <button type="button" aria-pressed={present.has(kol.wallet)} onClick={() => add(kol.wallet)}>
                {kolLabel(kol)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
