import { EMPTY_HARD_RULES, parseHardRules, type GropyHardRules } from "@/lib/gropy/hard-rules";

export const PROMPT_KEY = "gropy:prompt";
export const RULES_KEY = "gropy:hard-rules";
export const RULES_EVENT = "gropy:rules";
export const PROMPT_LIMIT = 2000;

export function readStoredInstructions(): { prompt: string; rules: GropyHardRules } {
  if (typeof window === "undefined") return { prompt: "", rules: EMPTY_HARD_RULES };
  return {
    prompt: (localStorage.getItem(PROMPT_KEY) ?? "").slice(0, PROMPT_LIMIT),
    rules: parseHardRules(localStorage.getItem(RULES_KEY)),
  };
}

export function notifyInstructions(): void {
  window.dispatchEvent(new Event(RULES_EVENT));
}
