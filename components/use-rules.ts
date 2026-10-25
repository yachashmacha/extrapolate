"use client";

import { useEffect, useState } from "react";
import { parseRules, type TradingRule } from "@/lib/rules";

export const RULES_EVENT = "extrapolate:rules";

export function rulesKey(bookKey: string): string {
  return `extrapolate:rules:${bookKey}`;
}

export function useRules(bookKey: string) {
  const [rules, setRules] = useState<TradingRule[]>([]);

  useEffect(() => {
    function load() {
      setRules(parseRules(localStorage.getItem(rulesKey(bookKey))));
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
