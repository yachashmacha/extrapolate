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
    activeRules > 0 ? ` Your ${activeRules} active ${activeRules === 1 ? "rule holds" : "rules hold"} that trade.` : "";
  const point =
    "This feed reads this wallet's own trades. A bias is named only when the trades match that measurement. A repeat is the order of the trades, with no motive attached. A tendency is a pattern that made money. Each card names the trades it came from.";
  const intro =
    bounds.ticketUsd > 0
      ? `${point} Where a habit names a next trade, that trade is ${fmtUsdPlain(bounds.ticketUsd)}. ${ticketWhy(bounds)}${rules} A caller leaves that trade where it is.`
      : `${point} A caller leaves the trade where this wallet and your rules put it.`;
  return (
    <section className="section" id="biases">
      <div className="bias-lead">
        <h2 className="bias-quote">Your biases from YOUR subconscious</h2>
        <p>{intro}</p>
      </div>
      {pendingHighs ? <p className="note">Coin highs and the chart after each buy are still loading.</p> : null}
      <div className="feeds">
        <HabitColumn
          title="Biases"
          habits={habits.negative}
          empty="No bias shows up in these trades yet."
          selectedId={selectedId}
          onSelect={onSelect}
        />
        <HabitColumn
          title="Tendencies that paid"
          habits={habits.positive}
          empty="No pattern that made money shows up in these trades yet."
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
    </section>
  );
}

function HabitColumn({
  title,
  habits,
  empty,
  selectedId,
  onSelect,
}: {
  title: string;
  habits: Habit[];
  empty: string;
  selectedId: string | null;
  onSelect: (habit: Habit) => void;
}) {
  return (
    <div>
      <h3 className="feed-title">{title}</h3>
      {habits.length === 0 ? <p className="note">{empty}</p> : null}
      <div className="feed-scroll">
        {habits.map((habit) => (
          <article key={habit.id} className={selectedId === habit.id ? "trade panel picked habit-card" : "trade panel habit-card"}>
            <p className={habit.mark === "Tendency" ? "kicker good" : "kicker bad"}>{habit.mark}</p>
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
