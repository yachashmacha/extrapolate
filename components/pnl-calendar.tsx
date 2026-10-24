"use client";

import { useMemo } from "react";
import { dailyPnl, dayLabel, monthGrid, monthLabel, shiftMonth, type DayPnl } from "@/lib/calendar";
import { fmtUsd } from "@/lib/format";
import type { AnnotatedTrade } from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PnlCalendar({
  trades,
  month,
  selectedDay,
  onMonth,
  onSelectDay,
}: {
  trades: AnnotatedTrade[];
  month: string;
  selectedDay: string | null;
  onMonth: (month: string) => void;
  onSelectDay: (dayKey: string) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, DayPnl>();
    for (const row of dailyPnl(trades)) map.set(row.dayKey, row);
    return map;
  }, [trades]);

  const cells = monthGrid(month);
  const monthRows = cells.flatMap((cell) => (cell.dayKey && byDay.has(cell.dayKey) ? [byDay.get(cell.dayKey)!] : []));
  const monthNet = monthRows.reduce((sum, row) => sum + row.pnlUsd, 0);
  const greenDays = monthRows.filter((row) => row.pnlUsd > 0).length;
  const redDays = monthRows.filter((row) => row.pnlUsd < 0).length;
  const maxAbs = Math.max(1, ...monthRows.map((row) => Math.abs(row.pnlUsd)));

  return (
    <section className="section" id="calendar" aria-label="Daily profit and loss">
      <div className="pager">
        <div>
          <p className="kicker">Portfolio</p>
          <h2>{monthLabel(month)}</h2>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month">
            Previous
          </button>
          <button type="button" className="ghost" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month">
            Next
          </button>
        </div>
      </div>
      <p className="month-stats">
        <span>
          Month <b className={monthNet >= 0 ? "good num" : "bad num"}>{fmtUsd(monthNet)}</b>
        </span>
        <span>
          Green days <b className="good num">{greenDays}</b>
        </span>
        <span>
          Red days <b className="bad num">{redDays}</b>
        </span>
      </p>
      <div className="calendar">
        {WEEKDAYS.map((name) => (
          <div key={name} className="dow">
            {name}
          </div>
        ))}
        {cells.map((cell, index) => {
          if (!cell.dayKey || cell.day === null) return <div key={`pad-${index}`} className="day pad" />;
          const row = byDay.get(cell.dayKey);
          const pnl = row?.pnlUsd ?? 0;
          const intensity = row ? 0.14 + 0.5 * (Math.abs(pnl) / maxAbs) : 0;
          const background = !row
            ? undefined
            : pnl >= 0
              ? `rgba(157, 206, 180, ${intensity})`
              : `rgba(227, 154, 132, ${intensity})`;
          return (
            <button
              key={cell.dayKey}
              type="button"
              className={row ? "day" : "day quiet"}
              aria-pressed={selectedDay === cell.dayKey}
              aria-label={`${dayLabel(cell.dayKey)}, ${row ? `${fmtUsd(pnl)}, ${row.trades} closed` : "no closed trades"}`}
              style={background ? { background } : undefined}
              onClick={() => onSelectDay(cell.dayKey!)}
            >
              <span className="num">{cell.day}</span>
              <span className={pnl > 0 ? "amt good" : pnl < 0 ? "amt bad" : "amt"}>{row ? fmtUsd(pnl) : ""}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
