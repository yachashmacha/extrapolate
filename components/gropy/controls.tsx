"use client";

import { useEffect, useState } from "react";
import { armedLines, EMPTY_HARD_RULES, type ExtraHardRule, type GropyHardRules } from "@/lib/gropy/hard-rules";
import { notifyInstructions, PROMPT_KEY, PROMPT_LIMIT, readStoredInstructions, RULES_KEY } from "@/lib/gropy/instructions";
import styles from "./gropy.module.css";

export function GropyControls() {
  const [prompt, setPrompt] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [rules, setRules] = useState<GropyHardRules>(EMPTY_HARD_RULES);
  const [extraDraft, setExtraDraft] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredInstructions();
    setPrompt(stored.prompt);
    setSavedPrompt(stored.prompt);
    setRules(stored.rules);
    setReady(true);
  }, []);

  function savePrompt(next: string) {
    const text = next.slice(0, PROMPT_LIMIT);
    localStorage.setItem(PROMPT_KEY, text);
    setPrompt(text);
    setSavedPrompt(text);
    notifyInstructions();
  }

  function saveRules(next: GropyHardRules) {
    localStorage.setItem(RULES_KEY, JSON.stringify(next));
    setRules(next);
    notifyInstructions();
  }

  function addExtra() {
    const text = extraDraft.trim();
    if (!text) return;
    const extra: ExtraHardRule = { id: crypto.randomUUID(), text, active: true };
    saveRules({ ...rules, extras: [...rules.extras, extra] });
    setExtraDraft("");
  }

  const armed = armedLines(rules);
  const promptDirty = prompt !== savedPrompt;

  return (
    <div className={styles.controls}>
      <form
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault();
          savePrompt(prompt.trim());
        }}
      >
        <label className="field" htmlFor="gropy-prompt">
          <span>Instructions for your grok bot</span>
          <textarea
            id="gropy-prompt"
            className={styles.prompt}
            rows={3}
            maxLength={PROMPT_LIMIT}
            value={prompt}
            placeholder="Only copy wallets buying under $50k. Skip a coin you already fired today. Size down after two red copies."
            onChange={(event) => setPrompt(event.target.value.slice(0, PROMPT_LIMIT))}
          />
        </label>
        <div className={styles.promptRow}>
          <button type="submit" className="primary" disabled={!ready || !promptDirty}>
            Save instructions
          </button>
          {savedPrompt && !promptDirty ? <p className={styles.note}>The bot is holding these instructions.</p> : null}
        </div>
      </form>

      <section className={styles.card} aria-labelledby="gropy-hard-rules">
        <p className="kicker" id="gropy-hard-rules">
          Hard rules
        </p>
        <p className={styles.note}>These override the prompt. A rule with no number stays off.</p>
        <div className={styles.rules}>
          <HardNumber
            on={rules.stopOn}
            amount={rules.stopPercent}
            label="Hard stop"
            unit="% below entry"
            amountLabel="Hard stop percent"
            onToggle={(stopOn) => saveRules({ ...rules, stopOn })}
            onAmount={(stopPercent) => saveRules({ ...rules, stopPercent })}
          />
          <HardNumber
            on={rules.takeProfitOn}
            amount={rules.takeProfitPercent}
            label="Take profit"
            unit="% above entry"
            amountLabel="Take profit percent"
            onToggle={(takeProfitOn) => saveRules({ ...rules, takeProfitOn })}
            onAmount={(takeProfitPercent) => saveRules({ ...rules, takeProfitPercent })}
          />
          <HardNumber
            on={rules.maxSolOn}
            amount={rules.maxSol}
            label="Max copy"
            unit="SOL"
            amountLabel="Maximum SOL per copy"
            onToggle={(maxSolOn) => saveRules({ ...rules, maxSolOn })}
            onAmount={(maxSol) => saveRules({ ...rules, maxSol })}
          />
          <HardNumber
            on={rules.dailyLossOn}
            amount={rules.dailyLossSol}
            label="Daily loss"
            unit="SOL, then stop for the day"
            amountLabel="Daily loss stop in SOL"
            onToggle={(dailyLossOn) => saveRules({ ...rules, dailyLossOn })}
            onAmount={(dailyLossSol) => saveRules({ ...rules, dailyLossSol })}
          />
        </div>
        <form
          className={styles.extraForm}
          onSubmit={(event) => {
            event.preventDefault();
            addExtra();
          }}
        >
          <label className="field">
            <span>Another hard rule</span>
            <input
              value={extraDraft}
              onChange={(event) => setExtraDraft(event.target.value)}
              placeholder="Never copy a coin you already hold"
              aria-label="Another hard rule"
            />
          </label>
          <button type="submit" className="primary">
            Add
          </button>
        </form>
        {rules.extras.length > 0 ? (
          <ul className={styles.extraList}>
            {rules.extras.map((rule) => (
              <li key={rule.id}>
                <input
                  type="checkbox"
                  checked={rule.active}
                  aria-label={rule.active ? "Turn hard rule off" : "Turn hard rule on"}
                  onChange={() =>
                    saveRules({
                      ...rules,
                      extras: rules.extras.map((item) => (item.id === rule.id ? { ...item, active: !item.active } : item)),
                    })
                  }
                />
                <span>{rule.text}</span>
                <button
                  type="button"
                  className="texty"
                  onClick={() => saveRules({ ...rules, extras: rules.extras.filter((item) => item.id !== rule.id) })}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {armed.length > 0 ? (
          <ul className={styles.armed}>
            {armed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.note}>No hard rule is armed.</p>
        )}
      </section>
    </div>
  );
}

function HardNumber({
  on,
  amount,
  label,
  unit,
  amountLabel,
  onToggle,
  onAmount,
}: {
  on: boolean;
  amount: string;
  label: string;
  unit: string;
  amountLabel: string;
  onToggle: (on: boolean) => void;
  onAmount: (amount: string) => void;
}) {
  return (
    <label className={styles.hardRule}>
      <input type="checkbox" checked={on} aria-label={`${label} on`} onChange={(event) => onToggle(event.target.checked)} />
      <span className={styles.hardLabel}>{label}</span>
      <span className={styles.amount}>
        <input
          inputMode="decimal"
          value={amount}
          aria-label={amountLabel}
          onChange={(event) => onAmount(event.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
        />
        <span className={styles.unit}>{unit}</span>
      </span>
    </label>
  );
}

