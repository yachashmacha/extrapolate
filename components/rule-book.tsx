"use client";

import { useEffect, useState } from "react";
import { useRules } from "@/components/use-rules";

export function RuleBook({ bookKey }: { bookKey: string }) {
  const { rules, save } = useRules(bookKey);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    setDraft("");
    setEditingId(null);
  }, [bookKey]);

  function add() {
    const text = draft.trim();
    if (!text) return;
    save([...rules, { id: crypto.randomUUID(), text, active: true }]);
    setDraft("");
  }

  function commitEdit(id: string) {
    const text = editingText.trim();
    if (!text) {
      save(rules.filter((rule) => rule.id !== id));
    } else {
      save(rules.map((rule) => (rule.id === id ? { ...rule, text } : rule)));
    }
    setEditingId(null);
  }

  return (
    <section className="section" id="rules">
      <div className="section-head">
        <h2>Your rules</h2>
        <p>Three rules start on. Turn one off, edit it, or add a rule you trade with.</p>
      </div>
      <div className="panel">
        <form
          className="rule-form"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <label className="field">
            <span>Add a rule</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type a rule you trade with"
              aria-label="New trading rule"
            />
          </label>
          <button type="submit" className="primary">
            Add
          </button>
        </form>
        {rules.length === 0 ? <p className="note">No rules yet.</p> : null}
        <ul className="rule-list">
          {rules.map((rule) => (
            <li key={rule.id} className={rule.active ? "rule-row" : "rule-row inactive"}>
              <input
                type="checkbox"
                checked={rule.active}
                aria-label={rule.active ? "Mark rule inactive" : "Mark rule active"}
                onChange={() => save(rules.map((item) => (item.id === rule.id ? { ...item, active: !item.active } : item)))}
              />
              {editingId === rule.id ? (
                <input
                  value={editingText}
                  aria-label="Edit rule"
                  onChange={(event) => setEditingText(event.target.value)}
                  onBlur={() => commitEdit(rule.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitEdit(rule.id);
                    }
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
              ) : (
                <span>{rule.text}</span>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="texty"
                  onClick={() => {
                    setEditingId(rule.id);
                    setEditingText(rule.text);
                  }}
                >
                  Edit
                </button>
                <button type="button" className="texty" onClick={() => save(rules.filter((item) => item.id !== rule.id))}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
