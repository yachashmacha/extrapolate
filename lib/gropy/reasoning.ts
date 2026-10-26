import { fmtUsdPlain } from "@/lib/format";
import { armedLines, positiveAmount, type GropyHardRules } from "@/lib/gropy/hard-rules";
import { fmtSol } from "@/lib/gropy/sol";
import type { SeatedBuyCap } from "@/lib/gropy/types";

export interface SwitchFacts {
  at: string;
  fromName: string;
  toName: string | null;
  losses: number;
  streak: number;
  lost: number;
  fromRealized: number;
  toRealized: number | null;
  trigger: "losses" | "unprofitable";
  lossCoins: string[];
  buyCaps: SeatedBuyCap[];
}

export interface SeatFacts {
  name: string | null;
  losses: number;
  streak: number;
  lost: number;
}

interface LossRule {
  clause: string;
  losses: number;
  inARow: boolean;
}

interface CapRule {
  clause: string;
  ceiling: number;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const NUMBER = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten";
const LOSS_WORD = "losing trades|losing trade|losing copies|losing copy|losses|loss|red copies|red copy|red closes|red close|red trades|red trade";
const LEAVE = /\b(leave|switch|fire|fired|drop|dump|stop copying|move on|next wallet|another wallet|different wallet|replace)\b/i;

/** Why the bot left this wallet, using the closes while they were copied and the instructions saved now. */
export function reasonsForSwitch(change: SwitchFacts, prompt: string, rules: GropyHardRules, unit: "sol" | "usd"): string[] {
  const reasons: string[] = [];
  if (change.trigger === "losses") {
    const noun = change.losses === 1 ? "losing trade" : "losing trades";
    reasons.push(`Left ${change.fromName} after ${change.losses} ${noun} while copied${coinList(change.lossCoins)}. The built-in rule fires on the third.`);
  } else {
    reasons.push(`Left ${change.fromName} because the verified result was no longer positive (${fmtResult(change.fromRealized, unit)}).`);
  }

  for (const rule of lossRules(prompt, rules)) {
    const count = rule.inARow ? change.streak : change.losses;
    if (count < rule.losses) continue;
    const detail = rule.inARow
      ? `the last ${change.streak} ${change.streak === 1 ? "close was a loss" : "closes were losses"}.`
      : `${change.losses} losing ${change.losses === 1 ? "trade" : "trades"} while copied.`;
    reasons.push(`Your instruction “${clip(rule.clause)}” fits this switch: ${detail}`);
  }

  const daily = rules.dailyLossOn ? positiveAmount(rules.dailyLossSol) : null;
  if (unit === "sol" && daily != null && change.lost + 1e-9 >= daily) {
    reasons.push(`The daily loss rule fits this switch: ${fmtSol(change.lost)} lost while copying them, and the rule is ${fmtSol(daily)} for the day.`);
  }

  const cap = capViolation(change.buyCaps, capRules(prompt, rules));
  if (cap) {
    const who = cap.buy.coin ? `${cap.buy.coin} was entered` : "A copy was entered";
    reasons.push(`${who} at ${fmtUsdPlain(cap.buy.marketCapUsd)} market cap. Your instruction “${clip(cap.rule.clause)}” keeps copies under ${fmtUsdPlain(cap.rule.ceiling)}.`);
  }

  if (change.toName && typeof change.toRealized === "number") {
    reasons.push(`${change.toName} took the seat at ${fmtResult(change.toRealized, unit)}, ahead of ${fmtResult(change.fromRealized, unit)}.`);
  } else {
    reasons.push("No other wallet had a better verified result, so the seat stayed empty.");
  }
  return reasons;
}

/** What the current seat looks like against the built-in rule and the saved instructions. */
export function seatNotes(seat: SeatFacts, prompt: string, rules: GropyHardRules, unit: "sol" | "usd"): string[] {
  if (!seat.name) return ["Nobody is seated."];
  const noun = seat.losses === 1 ? "losing trade" : "losing trades";
  const now = seat.losses === 0 ? `Still copying ${seat.name}. No losing trade while copied.` : `Still copying ${seat.name}. ${seat.losses} ${noun} while copied.`;
  const notes = [now, "The built-in rule fires on the third losing trade."];
  for (const rule of lossRules(prompt, rules)) {
    const count = rule.inARow ? seat.streak : seat.losses;
    if (count < rule.losses) continue;
    notes.push(`Your instruction “${clip(rule.clause)}” is met on these closes.`);
  }
  const daily = rules.dailyLossOn ? positiveAmount(rules.dailyLossSol) : null;
  if (unit === "sol" && daily != null && seat.lost + 1e-9 >= daily) {
    notes.push(`The daily loss rule is met: ${fmtSol(seat.lost)} lost while copying them, and the rule is ${fmtSol(daily)} for the day.`);
  }
  return notes;
}

export function instructionPreview(prompt: string, rules: GropyHardRules): { prompt: string; rules: string[] } {
  const text = prompt.trim();
  return {
    prompt: text.length > 280 ? `${text.slice(0, 280)}…` : text,
    rules: armedLines(rules),
  };
}

function lossRules(prompt: string, rules: GropyHardRules): LossRule[] {
  const found: LossRule[] = [];
  for (const clause of clauses(prompt)) {
    const rule = parseLoss(clause, true);
    if (rule) found.push(rule);
  }
  for (const extra of rules.extras) {
    if (!extra.active) continue;
    for (const clause of clauses(extra.text)) {
      const rule = parseLoss(clause, false);
      if (rule) found.push(rule);
    }
  }
  return found;
}

function capRules(prompt: string, rules: GropyHardRules): CapRule[] {
  const texts = [prompt, ...rules.extras.filter((extra) => extra.active).map((extra) => extra.text)];
  const found: CapRule[] = [];
  for (const text of texts) {
    for (const clause of clauses(text)) {
      const ceiling = parseCeiling(clause);
      if (ceiling != null) found.push({ clause, ceiling });
    }
  }
  return found;
}

function capViolation(buys: readonly SeatedBuyCap[], rules: readonly CapRule[]): { buy: SeatedBuyCap; rule: CapRule } | null {
  let worst: { buy: SeatedBuyCap; rule: CapRule; gap: number } | null = null;
  for (const buy of buys) {
    if (!(buy.marketCapUsd > 0)) continue;
    for (const rule of rules) {
      const gap = buy.marketCapUsd - rule.ceiling;
      if (gap <= 0) continue;
      if (!worst || gap > worst.gap) worst = { buy, rule, gap };
    }
  }
  return worst ? { buy: worst.buy, rule: worst.rule } : null;
}

function parseLoss(clause: string, requireLeave: boolean): LossRule | null {
  if (requireLeave && !mentionsLeave(clause)) return null;
  const more = new RegExp(`\\bmore than\\s+(${NUMBER})\\s+(${LOSS_WORD})\\b`, "i").exec(clause);
  const plain = new RegExp(`\\b(${NUMBER})\\s+(${LOSS_WORD})\\b`, "i").exec(clause);
  const hit = more ?? plain;
  if (!hit) return null;
  const parsed = parseNumber(hit[1]);
  if (parsed == null || parsed <= 0) return null;
  return {
    clause: clause.trim(),
    losses: more ? parsed + 1 : parsed,
    inARow: /\bin a row\b|\bconsecutive\b|\bback to back\b/i.test(clause),
  };
}

function mentionsLeave(clause: string): boolean {
  if (LEAVE.test(clause)) return true;
  return /\bskip\b/i.test(clause) && /\bwallet\b/i.test(clause);
}

function parseCeiling(clause: string): number | null {
  if (!/\b(under|below|less than)\b/i.test(clause)) return null;
  if (!/(\$|market cap|mcap|\bmc\b)/i.test(clause)) return null;
  const match = /(?:under|below|less than)\s+\$?\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?\b/.exec(clause);
  if (!match) return null;
  let value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const suffix = match[2]?.toLowerCase();
  if (suffix === "k") value *= 1_000;
  if (suffix === "m") value *= 1_000_000;
  return value;
}

function parseNumber(token: string): number | null {
  const word = NUMBER_WORDS[token.toLowerCase()];
  if (word) return word;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

function clauses(text: string): string[] {
  return text
    .split(/[\n.!?]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function coinList(coins: readonly string[]): string {
  const names: string[] = [];
  for (const coin of coins) {
    if (coin && !names.includes(coin)) names.push(coin);
  }
  if (names.length === 0) return "";
  if (names.length <= 3) return ` (${names.join(", ")})`;
  return ` (${names.slice(0, 3).join(", ")}, and ${names.length - 3} more)`;
}

function fmtResult(value: number, unit: "sol" | "usd"): string {
  return unit === "sol" ? fmtSol(value, true) : fmtUsdPlain(value);
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean;
}
