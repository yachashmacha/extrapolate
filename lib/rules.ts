import { fmtUsdPlain } from "@/lib/format";

export interface TradingRule {
  id: string;
  text: string;
  active: boolean;
}

/** Price at or under this fraction of the entry is the stop. Exiting below it means the stop was missed. */
export const EXIT_RULE_ID = "base-exit-half";
export const EXIT_RULE_TEXT = "Exit the position if the chart goes below 50% of your position.";

/** The base ticket may use at most this fraction of the portfolio. */
export const SIZE_RULE_ID = "base-size-tenth";
export const SIZE_RULE_TEXT = "Trade with no more than 10 percent of your portfolio for your base trade.";

export const BASE_RULES: TradingRule[] = [
  { id: EXIT_RULE_ID, text: EXIT_RULE_TEXT, active: true },
  { id: SIZE_RULE_ID, text: SIZE_RULE_TEXT, active: true },
];

export function baseRules(): TradingRule[] {
  return BASE_RULES.map((rule) => ({ ...rule }));
}

/** The list the score and the ticket read. A missing book starts from the two base rules. */
export function activeRules(rules?: TradingRule[] | null): TradingRule[] {
  const list = rules == null ? baseRules() : rules;
  return list.filter((rule) => rule.active && rule.text.trim());
}

/** Put either base rule back when this book has never been seeded. */
export function withBaseRules(rules: TradingRule[]): TradingRule[] {
  const missing = BASE_RULES.filter((base) => !rules.some((rule) => rule.id === base.id));
  if (missing.length === 0) return rules;
  return [...missing.map((rule) => ({ ...rule })), ...rules];
}

export function parseRules(raw: string | null): TradingRule[] {
  if (!raw) return baseRules();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return baseRules();
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { id?: unknown; text?: unknown; active?: unknown };
      if (typeof row.id !== "string" || typeof row.text !== "string") return [];
      const text = row.text.trim();
      if (!text) return [];
      return [{ id: row.id, text, active: row.active !== false }];
    });
  } catch {
    return baseRules();
  }
}

export interface FractionRule {
  text: string;
  fraction: number;
}

export function activeStopRule(rules?: TradingRule[] | null): FractionRule | null {
  for (const rule of activeRules(rules)) {
    if (rule.id !== EXIT_RULE_ID && !looksLikeStop(rule.text)) continue;
    if (!looksLikeStop(rule.text)) continue;
    return { text: rule.text, fraction: readPercent(rule.text) ?? 0.5 };
  }
  return null;
}

export function activeSizeRule(rules?: TradingRule[] | null): FractionRule | null {
  for (const rule of activeRules(rules)) {
    if (rule.id !== SIZE_RULE_ID && !looksLikePortfolioSize(rule.text)) continue;
    if (!looksLikePortfolioSize(rule.text)) continue;
    return { text: rule.text, fraction: readPercent(rule.text) ?? 0.1 };
  }
  return null;
}

/**
 * The stop is missed when the exit price is below the fraction of the entry.
 * Market cap is price times supply, so the two caps are the price ratio.
 * With neither cap, the book has no path and no price, and the close percent is the evidence.
 * An exit above the line, or exactly on it, did not break the rule.
 */
export function exitedBelowStop(
  trade: { entryMarketCapUsd: number; exitMarketCapUsd: number; pnlPct: number },
  fraction: number,
): boolean {
  if (!(fraction > 0) || fraction >= 1) return false;
  const entry = trade.entryMarketCapUsd;
  const exit = trade.exitMarketCapUsd;
  if (entry > 0 && exit > 0) return exit < entry * fraction;
  if (entry > 0 && exit === 0) return true;
  if (!(entry > 0) && !(exit > 0)) return trade.pnlPct < (fraction - 1) * 100;
  return false;
}

/**
 * Portfolio value at the entry, on the same basis as account size:
 * today's portfolio minus realized PnL that closed after this entry.
 * A buy does not change that total. Only a later close does.
 */
export function portfolioAtEntry(
  entryAt: string,
  trades: { exitAt: string; pnlUsd: number }[],
  accountUsd: number,
): number | null {
  if (!(accountUsd > 0) || !entryAt) return null;
  let later = 0;
  for (const trade of trades) {
    if (trade.exitAt > entryAt) later += trade.pnlUsd;
  }
  const value = Math.round((accountUsd - later) * 100) / 100;
  return value > 0 ? value : null;
}

export function ticketBrokeSize(amountUsd: number, portfolioUsd: number, fraction: number): boolean {
  if (!(amountUsd > 0) || !(portfolioUsd > 0) || !(fraction > 0)) return false;
  return amountUsd > portfolioUsd * fraction + 0.001;
}

export interface RuledTrade {
  id: string;
  symbol: string;
  entryAt: string;
  exitAt: string;
  entryMarketCapUsd: number;
  exitMarketCapUsd: number;
  pnlPct: number;
  pnlUsd: number;
  amountUsd: number;
}

export interface RuleBreak {
  stop: boolean;
  size: boolean;
  note: string;
}

export function ruleBreak(
  trade: RuledTrade,
  book: { exitAt: string; pnlUsd: number }[],
  options?: { rules?: TradingRule[] | null; accountUsd?: number | null },
): RuleBreak {
  const stop = activeStopRule(options?.rules);
  const size = activeSizeRule(options?.rules);
  const parts: string[] = [];
  let missedStop = false;
  let oversized = false;
  if (stop && exitedBelowStop(trade, stop.fraction)) {
    missedStop = true;
    parts.push(`Exited below ${Math.round(stop.fraction * 100)}% of the entry. That broke “${stop.text}”.`);
  }
  const account = options?.accountUsd;
  if (size && account != null && account > 0) {
    const portfolio = portfolioAtEntry(trade.entryAt, book, account);
    if (portfolio != null && ticketBrokeSize(trade.amountUsd, portfolio, size.fraction)) {
      oversized = true;
      const pct = Math.round(size.fraction * 100);
      parts.push(
        `The ${fmtUsdPlain(trade.amountUsd)} ticket was more than ${pct}% of the ${fmtUsdPlain(portfolio)} portfolio at the entry. That broke “${size.text}”.`,
      );
    }
  }
  return { stop: missedStop, size: oversized, note: parts.join(" ") };
}

export function dayBreachSentence(pastStop: { pnlUsd: number }[], oversized: { pnlUsd: number }[], rules?: TradingRule[] | null): string {
  const stop = activeStopRule(rules);
  const size = activeSizeRule(rules);
  const parts: string[] = [];
  if (stop && pastStop.length > 0) {
    const pct = Math.round(stop.fraction * 100);
    const noun = pastStop.length === 1 ? "close" : "closes";
    parts.push(`${pastStop.length} ${noun} exited below ${pct}% of the entry, past the stop. That broke “${stop.text}”.`);
  }
  if (size && oversized.length > 0) {
    const pct = Math.round(size.fraction * 100);
    const noun = oversized.length === 1 ? "ticket was" : "tickets were";
    const won = oversized.some((trade) => trade.pnlUsd > 0) ? ", including a winner" : "";
    parts.push(
      `${oversized.length} ${noun} more than ${pct}% of the portfolio at the entry${won}. That broke “${size.text}”.`,
    );
  }
  return parts.join(" ");
}

function looksLikeStop(text: string): boolean {
  return /exit|stop|get out|below|under|half/i.test(text) && /position|entry|chart|%/i.test(text);
}

function looksLikePortfolioSize(text: string): boolean {
  return /portfolio|base trade/i.test(text) && /\d+(?:\.\d+)?\s*(?:%|percent)/i.test(text);
}

function readPercent(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return value / 100;
}
