"use client";

import { useEffect, useState } from "react";
import { fmtWhen } from "@/lib/format";
import { EMPTY_HARD_RULES, type GropyHardRules } from "@/lib/gropy/hard-rules";
import { readStoredInstructions, RULES_EVENT } from "@/lib/gropy/instructions";
import { instructionPreview, reasonsForSwitch, seatNotes, type SeatFacts, type SwitchFacts } from "@/lib/gropy/reasoning";
import styles from "./gropy.module.css";

export function GropyReasoning({
  switches,
  seat,
  unit,
}: {
  switches: readonly SwitchFacts[];
  seat: SeatFacts;
  unit: "sol" | "usd";
}) {
  const [prompt, setPrompt] = useState("");
  const [rules, setRules] = useState<GropyHardRules>(EMPTY_HARD_RULES);

  useEffect(() => {
    const apply = () => {
      const stored = readStoredInstructions();
      setPrompt(stored.prompt);
      setRules(stored.rules);
    };
    apply();
    window.addEventListener(RULES_EVENT, apply);
    window.addEventListener("storage", apply);
    return () => {
      window.removeEventListener(RULES_EVENT, apply);
      window.removeEventListener("storage", apply);
    };
  }, []);

  const preview = instructionPreview(prompt, rules);
  const notes = seatNotes(seat, prompt, rules, unit);
  const history = [...switches].reverse();

  return (
    <aside className={`${styles.card} ${styles.reasoning}`} aria-labelledby="gropy-reasoning">
      <p className="kicker" id="gropy-reasoning">
        Reasoning
      </p>
      <p className={styles.note}>Why the bot left one wallet for another. Each note uses the closes while that wallet was copied, and the instructions saved on this page.</p>
      {preview.prompt ? <p className={styles.reason}>Holding: {preview.prompt}</p> : <p className={styles.note}>No extra copy instructions are saved.</p>}
      {preview.rules.length > 0 ? (
        <ul className={styles.armed}>
          {preview.rules.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.feedItem}>
        {notes.map((line, index) => (
          <p key={`${index}-${line}`} className={styles.reason}>
            {line}
          </p>
        ))}
      </div>
      {history.length > 0 ? (
        <ol className={styles.feed}>
          {history.map((change) => (
            <li key={`${change.at}-${change.fromName}`}>
              <span className={styles.when}>{fmtWhen(change.at)} ET</span>
              {reasonsForSwitch(change, prompt, rules, unit).map((line, index) => (
                <p key={`${index}-${line}`} className={styles.reason}>
                  {line}
                </p>
              ))}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.note}>No wallet has been left yet.</p>
      )}
    </aside>
  );
}
