"use client";

import { useEffect, useState } from "react";
import { baseRules, parseRules, PACE_RULE_ID, withBaseRule, withBaseRules, type TradingRule } from "@/lib/rules";

export const RULES_EVENT = "extrapolate:rules";

export function rulesKey(bookKey: string): string {
  return `extrapolate:rules:${bookKey}`;
}

export function useRules(bookKey: string) {
  const [rules, setRules] = useState<TradingRule[]>(baseRules);

  useEffect(() => {
    function load() {
      const key = rulesKey(bookKey);
      const seedKey = `${key}:base-v1`;
      const paceKey = `${key}:base-trades-fifty`;
      const raw = localStorage.getItem(key);
      let next = parseRules(raw);
      if (!localStorage.getItem(seedKey)) {
        next = withBaseRules(next);
        localStorage.setItem(key, JSON.stringify(next));
        localStorage.setItem(seedKey, "1");
        localStorage.setItem(paceKey, "1");
      } else if (!localStorage.getItem(paceKey)) {
        next = withBaseRule(next, PACE_RULE_ID);
        localStorage.setItem(key, JSON.stringify(next));
        localStorage.setItem(paceKey, "1");
      }
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

  return { rules, save };
}
