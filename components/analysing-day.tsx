"use client";

import { useEffect, useId, useRef, useState } from "react";
import { analysingLabel, deskDayName, selectableDeskDays, todayKeyEt } from "@/lib/desk-day";

export function AnalysingDay({
  dayKey,
  onSelect,
}: {
  dayKey: string;
  onSelect: (dayKey: string) => void;
}) {
  const now = new Date();
  const today = todayKeyEt(now);
  const days = selectableDeskDays(now);
  const label = analysingLabel(dayKey, now);
  const value = dayKey === today ? "Today" : deskDayName(dayKey);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(dayKey);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(listId, active))?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = Math.max(0, days.indexOf(active));
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setActive(dayKey);
        setOpen(true);
        return;
      }
      setActive(days[Math.min(days.length - 1, index + 1)] ?? days[0]);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setActive(dayKey);
        setOpen(true);
        return;
      }
      setActive(days[Math.max(0, index - 1)] ?? days[0]);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActive(days[0]);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActive(days[days.length - 1]);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setActive(dayKey);
        setOpen(true);
        return;
      }
      onSelect(active);
      setOpen(false);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") setOpen(false);
  }

  return (
    <div className="analysing" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="analysing-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(listId, active) : undefined}
        aria-label={label}
        onClick={() => {
          setActive(dayKey);
          setOpen((current) => !current);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="analysing-kicker">analysing:</span>
        <span>{value}</span>
        <svg className={open ? "analysing-chevron open" : "analysing-chevron"} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.2 4.3 L6 8 L9.8 4.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul className="analysing-menu" id={listId} role="listbox" aria-label="Day of the month">
          {days.map((key) => {
            const name = key === today ? "Today" : deskDayName(key);
            const selected = key === dayKey;
            return (
              <li
                key={key}
                id={optionId(listId, key)}
                role="option"
                aria-selected={selected}
                className={key === active ? "analysing-option active" : "analysing-option"}
                onMouseEnter={() => setActive(key)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(key);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                {name}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function optionId(listId: string, dayKey: string): string {
  return `${listId}-${dayKey}`;
}
