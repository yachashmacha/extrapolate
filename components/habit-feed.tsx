"use client";

import type { BookBounds } from "@/lib/analysis/bounds";
import type { Habit } from "@/lib/analysis/habits";
import { ticketWhy } from "@/lib/analysis/tips";
import { fmtUsdPlain } from "@/lib/format";

export function HabitFeed({
  habits,
  bounds,
  activeRules,
  pendingHighs,
  selectedId,
  onSelect,
}: {
  habits: { positive: Habit[]; negative: Habit[] };
  bounds: BookBounds;
  activeRules: number;
  pendingHighs: boolean;
  selectedId: string | null;
  onSelect: (habit: Habit) => void;
}) {
  const rules =
    activeRules > 0 ? ` Your ${activeRules} active ${activeRules === 1 ? "rule holds" : "rules hold"} that ticket.` : "";
  const intro =
    bounds.ticketUsd > 0
      ? `Repeats across the closed trades. Each one names the trades it came from. Where a habit names a next ticket, that ticket is ${fmtUsdPlain(bounds.ticketUsd)}. ${ticketWhy(bounds)}${rules} A caller leaves that ticket where it is.`
      : "Repeats across the closed trades. Each one names the trades it came from. A caller leaves the ticket where this wallet and your rules put it.";
  return (
    <section className="section" id="habits">
      <div className="section-head">
        <h2>Habits</h2>
        <p>{intro}</p>
      </div>
      {pendingHighs ? <p className="note">More coin highs are still loading.</p> : null}
      <div className="feeds">
        <HabitColumn title="Positive" tone="positive" habits={habits.positive} selectedId={selectedId} onSelect={onSelect} />
        <HabitColumn title="Negative" tone="negative" habits={habits.negative} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </section>
  );
}

function HabitColumn({
  title,
  tone,
  habits,
  selectedId,
  onSelect,
}: {
  title: string;
  tone: "positive" | "negative";
  habits: Habit[];
  selectedId: string | null;
  onSelect: (habit: Habit) => void;
}) {
  return (
    <div>
      <h3 className="feed-title">{title}</h3>
      {habits.length === 0 ? <p className="note">No repeat on this side yet.</p> : null}
      <div className="feed-scroll">
        {habits.map((habit) => (
          <article key={habit.id} className={selectedId === habit.id ? "trade panel picked habit-card" : "trade panel habit-card"}>
            <p className={tone === "positive" ? "kicker good" : "kicker bad"}>{tone === "positive" ? "Positive" : "Negative"}</p>
            <h3>{habit.title}</h3>
            <p className="habit-stat num">{habit.stat}</p>
            <p>{habit.detail}</p>
            <button type="button" className="ghost" onClick={() => onSelect(habit)} aria-pressed={selectedId === habit.id}>
              Show these trades
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
