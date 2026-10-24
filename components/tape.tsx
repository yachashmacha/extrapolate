"use client";

import { useState } from "react";
import { fmtHold, fmtMc, fmtPct, fmtUsd, fmtUsdPlain, fmtWhen } from "@/lib/format";
import { KOL_CATALOG, makeKol } from "@/lib/kols";
import { META_LABEL, META_ORDER } from "@/lib/metas";
import type { AnnotatedTrade, KolTag, KolTiming, MetaId } from "@/lib/types";

export function Tape({
  trades,
  activeLabel,
  onClear,
  onChange,
}: {
  trades: AnnotatedTrade[];
  activeLabel: string | null;
  onClear: () => void;
  onChange: (id: string, patch: { kols?: KolTag[]; metas?: MetaId[] }) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [side, setSide] = useState<"all" | "win" | "loss">("all");
  const visible = trades.filter((trade) => side === "all" || trade.result === side);

  return (
    <section className="section" id="tape">
      <div className="section-head">
        <h2>The tape</h2>
        <p>Open a fill to see how it sits against the winners, and to tag the KOL or the narrative the chain could not know.</p>
      </div>
      <div className="filter-row">
        {(["all", "win", "loss"] as const).map((value) => (
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
              {trade.kols.length > 0 ? ` · ${trade.kols.map((kol) => kol.name).join(", ")}` : ""}
            </span>
            <span className={trade.pnlUsd >= 0 ? "pnl good" : "pnl bad"}>
              {fmtPct(trade.pnlPct)}
              <span className="trade-meta"> {fmtUsd(trade.pnlUsd)}</span>
            </span>
          </button>
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
  const [custom, setCustom] = useState("");
  const knownIds = new Set(KOL_CATALOG.map((kol) => kol.id));
  const extras = trade.kols.filter((kol) => !knownIds.has(kol.id));

  function setTiming(kol: KolTag, timing: KolTiming) {
    onChange(trade.id, {
      kols: trade.kols.map((item) => (item.id === kol.id ? { ...item, timing } : item)),
    });
  }

  function toggle(id: string) {
    const existing = trade.kols.find((kol) => kol.id === id);
    onChange(trade.id, {
      kols: existing ? trade.kols.filter((kol) => kol.id !== id) : [...trade.kols, makeKol(id, "before")],
    });
  }

  function addCustom() {
    const handle = custom.trim().replace(/^@/, "");
    if (!handle) return;
    if (!trade.kols.some((kol) => kol.id === handle.toLowerCase())) {
      onChange(trade.id, { kols: [...trade.kols, makeKol(handle, "before")] });
    }
    setCustom("");
  }

  return (
    <div className="editor">
      <span className="label">KOLs in this coin</span>
      <div className="chip-row">
        {KOL_CATALOG.map((kol) => {
          const on = trade.kols.find((item) => item.id === kol.id);
          return (
            <span key={kol.id} className="chip-row">
              <button type="button" className="chip" aria-pressed={Boolean(on)} onClick={() => toggle(kol.id)}>
                {kol.name}
              </button>
              {on ? (
                <select className="timing" aria-label={`${kol.name} timing`} value={on.timing} onChange={(event) => setTiming(on, event.target.value as KolTiming)}>
                  <option value="before">before you</option>
                  <option value="with">with you</option>
                  <option value="after">after you</option>
                </select>
              ) : null}
            </span>
          );
        })}
        {extras.map((kol) => (
          <span key={kol.id} className="chip-row">
            <button type="button" className="chip" aria-pressed="true" onClick={() => toggle(kol.id)}>{kol.name}</button>
            <select className="timing" aria-label={`${kol.name} timing`} value={kol.timing} onChange={(event) => setTiming(kol, event.target.value as KolTiming)}>
              <option value="before">before you</option>
              <option value="with">with you</option>
              <option value="after">after you</option>
            </select>
          </span>
        ))}
      </div>
      <div className="actions">
        <input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="@handle"
          aria-label="Add a KOL handle"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustom();
            }
          }}
        />
        <button type="button" className="ghost" onClick={addCustom}>Add KOL</button>
      </div>
    </div>
  );
}
