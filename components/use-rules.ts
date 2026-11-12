"use client";

import { useEffect, useState } from "react";
import { BASE_RULES, baseRules, parseRules, seedStoredRules, type TradingRule } from "@/lib/rules";

export const RULES_EVENT = "extrapolate:rules";

export function rulesKey(bookKey: string): string {
  return `extrapolate:rules:${bookKey}`;
}

function removedKey(key: string): string {
  return `${key}:removed`;
}

function readRemovedIds(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(removedKey(key)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && BASE_RULES.some((rule) => rule.id === id));
  } catch {
    return [];
  }
}

export function useRules(bookKey: string) {
  const [rules, setRules] = useState<TradingRule[]>(baseRules);

  useEffect(() => {
    function load() {
      const key = rulesKey(bookKey);
      const seedKey = `${key}:base-v1`;
      const paceKey = `${key}:base-trades-fifty`;
      const removedIds = readRemovedIds(key);
      const next = seedStoredRules(parseRules(localStorage.getItem(key)), {
        seeded: localStorage.getItem(seedKey) === "1",
        paceSeeded: localStorage.getItem(paceKey) === "1",
        removedIds,
      });
      const serialized = JSON.stringify(next);
      if (localStorage.getItem(key) !== serialized) localStorage.setItem(key, serialized);
      localStorage.setItem(seedKey, "1");
      localStorage.setItem(paceKey, "1");
      setRules(next);
    }
    load();
    window.addEventListener(RULES_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(RULES_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [bookKey]);

  function save(next: TradingRule[]) {
    localStorage.setItem(rulesKey(bookKey), JSON.stringify(next));
    setRules(next);
    window.dispatchEvent(new Event(RULES_EVENT));
  }

  function remove(id: string) {
    const key = rulesKey(bookKey);
    if (BASE_RULES.some((rule) => rule.id === id)) {
      const removedIds = new Set(readRemovedIds(key));
      removedIds.add(id);
      localStorage.setItem(removedKey(key), JSON.stringify([...removedIds]));
    }
    save(rules.filter((rule) => rule.id !== id));
  }

  return { rules, save, remove };
}
