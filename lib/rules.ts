import { dayKeyEt } from "@/lib/calendar";
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

/** Closed round trips on one America/New_York day. The buy and the sell are one trade. */
export const PACE_RULE_ID = "base-trades-fifty";
export const PACE_RULE_TEXT = "Don’t make more than 50 trades a day.";

export const BASE_RULES: TradingRule[] = [
  { id: EXIT_RULE_ID, text: EXIT_RULE_TEXT, active: true },
  { id: SIZE_RULE_ID, text: SIZE_RULE_TEXT, active: true },
  { id: PACE_RULE_ID, text: PACE_RULE_TEXT, active: true },
];

export function baseRules(): TradingRule[] {
  return BASE_RULES.map((rule) => ({ ...rule }));
}

/** The list the score and the ticket read. A missing book starts from the three base rules. */
export function activeRules(rules?: TradingRule[] | null): TradingRule[] {
  const list = rules == null ? baseRules() : rules;
  return list.filter((rule) => rule.active && rule.text.trim());
}

/** Put one missing base rule back, beside the other presets, without moving rules the trader already has. */
export function withBaseRule(rules: TradingRule[], id: string): TradingRule[] {
  if (rules.some((rule) => rule.id === id)) return rules;
  const presetIndex = BASE_RULES.findIndex((rule) => rule.id === id);
  if (presetIndex < 0) return rules;
  const next = [...rules];
  const base = { ...BASE_RULES[presetIndex] };
  for (let cursor = presetIndex - 1; cursor >= 0; cursor -= 1) {
    const earlier = next.findIndex((rule) => rule.id === BASE_RULES[cursor].id);
    if (earlier >= 0) {
      next.splice(earlier + 1, 0, base);
      return next;
    }
  }
  for (let cursor = presetIndex + 1; cursor < BASE_RULES.length; cursor += 1) {
    const later = next.findIndex((rule) => rule.id === BASE_RULES[cursor].id);
    if (later >= 0) {
      next.splice(later, 0, base);
      return next;
    }
  }
  next.unshift(base);
  return next;
}

/** Put any missing base rule back when this book has never been seeded. */
export function withBaseRules(rules: TradingRule[]): TradingRule[] {
  let next = rules;
  for (const base of BASE_RULES) {
    const updated = withBaseRule(next, base.id);
    if (updated !== next) next = updated;
  }
  return next;
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

export interface PaceRule {
  text: string;
  limit: number;
}

/** The daily cap, while that rule is on. The number in the text is the limit. */
export function activePaceRule(rules?: TradingRule[] | null): PaceRule | null {
  for (const rule of activeRules(rules)) {
    if (rule.id !== PACE_RULE_ID && !looksLikeDailyTradeCap(rule.text)) continue;
    if (!looksLikeDailyTradeCap(rule.text)) continue;
    return { text: rule.text, limit: readTradeCap(rule.text) ?? 50 };
  }
  return null;
}

/**
 * Closed round trips whose exit falls on this America/New_York day.
 * A row with no exit is still open, so it is not a trade yet.
 * A buy and its sell are one row here, not two.
 */
export function countClosedRoundTrips(rows: { exitAt?: string }[], dayKey: string): number {
  let count = 0;
  for (const row of rows) {
    if (!row.exitAt) continue;
    if (dayKeyEt(row.exitAt) === dayKey) count += 1;
  }
  return count;
}

/** Closes after the limit, in exit order. The first `limit` closes of the day stayed inside the rule. */
export function paceOverIds(day: { id: string; exitAt: string }[], limit: number): string[] {
  if (!(limit > 0) || day.length <= limit) return [];
  const ordered = [...day].sort((left, right) => left.exitAt.localeCompare(right.exitAt) || left.id.localeCompare(right.id));
  return ordered.slice(limit).map((trade) => trade.id);
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

export interface PortfolioTrade {
  entryAt?: string;
  exitAt: string;
  amountUsd?: number;
  pnlUsd: number;
}

export interface OpenCost {
  entryAt: string;
  costUsd: number;
}

export interface PortfolioExtras {
  cashUsd?: number | null;
  opens?: OpenCost[] | null;
}

/**
 * Portfolio at the entry: liquid cash plus the cost basis of positions open then.
 * Meme bags stay at cost. Start from cash and open cost now, then undo buys and
 * closes that happened after that entry. A buy only moves cash into cost. A close
 * realizes pnl and removes that cost. If the book cannot support a positive
 * portfolio at that entry, returns null and the fill is not a 10% break.
 */
export function portfolioAtEntry(
  entryAt: string,
  trades: PortfolioTrade[],
  accountUsd?: number | null,
  extras?: PortfolioExtras,
): number | null {
  if (!entryAt) return null;
  const opens = (extras?.opens ?? []).filter((open) => open.costUsd > 0);
  if (opens.some((open) => !open.entryAt)) return null;
  const balances = startingBalances(accountUsd, extras?.cashUsd, opens);
  if (!balances) return null;
  const portfolioNow = balances.cash + balances.openCost;
  const costed = trades.length === 0 || trades.every((trade) => Boolean(trade.entryAt) && (trade.amountUsd ?? 0) > 0 && Boolean(trade.exitAt));
  if (!costed) return pnlOnly(entryAt, trades, portfolioNow);
  return walkBook(entryAt, trades, opens, balances);
}

function startingBalances(
  accountUsd: number | null | undefined,
  cashUsd: number | null | undefined,
  opens: OpenCost[],
): { cash: number; openCost: number } | null {
  const openCost = opens.reduce((sum, open) => sum + open.costUsd, 0);
  const account = accountUsd != null && accountUsd > 0 ? accountUsd : null;
  const cashKnown = cashUsd != null && Number.isFinite(cashUsd) && cashUsd >= 0 ? cashUsd : null;
  let portfolio: number | null = null;
  if (cashKnown != null) portfolio = cashKnown + openCost;
  if (account != null) portfolio = portfolio == null ? account : Math.max(portfolio, account);
  if (portfolio == null || !(portfolio > 0)) return null;
  const cash = portfolio - openCost;
  if (cash < -0.05) return null;
  return { cash: Math.max(0, cash), openCost };
}

function pnlOnly(entryAt: string, trades: { exitAt: string; pnlUsd: number }[], portfolioNow: number): number | null {
  if (!(portfolioNow > 0)) return null;
  let later = 0;
  const entryMs = Date.parse(entryAt);
  for (const trade of trades) {
    const exitMs = Date.parse(trade.exitAt);
    const laterClose = Number.isFinite(entryMs) && Number.isFinite(exitMs) ? exitMs > entryMs : trade.exitAt > entryAt;
    if (laterClose) later += trade.pnlUsd;
  }
  const value = Math.round((portfolioNow - later) * 100) / 100;
  return value > 0 ? value : null;
}

function walkBook(
  entryAt: string,
  trades: PortfolioTrade[],
  opens: OpenCost[],
  balances: { cash: number; openCost: number },
): number | null {
  let cash = balances.cash;
  let openCost = balances.openCost;
  const events: { at: string; kind: "buy" | "sell"; amount: number; pnl: number }[] = [];
  for (const open of opens) {
    events.push({ at: open.entryAt, kind: "buy", amount: open.costUsd, pnl: 0 });
  }
  for (const trade of trades) {
    const amount = trade.amountUsd ?? 0;
    if (!(amount > 0) || !trade.entryAt || !trade.exitAt) continue;
    events.push({ at: trade.entryAt, kind: "buy", amount, pnl: trade.pnlUsd });
    events.push({ at: trade.exitAt, kind: "sell", amount, pnl: trade.pnlUsd });
  }
  const entryMs = Date.parse(entryAt);
  events.sort((a, b) => {
    const aMs = Date.parse(a.at);
    const bMs = Date.parse(b.at);
    if (aMs !== bMs) return aMs < bMs ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "sell" ? -1 : 1;
    return 0;
  });
  for (const event of events) {
    const atMs = Date.parse(event.at);
    const afterEntry = Number.isFinite(entryMs) && Number.isFinite(atMs) ? atMs > entryMs : event.at > entryAt;
    if (!afterEntry) continue;
    if (event.kind === "sell") {
      cash -= event.amount + event.pnl;
      openCost += event.amount;
    } else {
      cash += event.amount;
      openCost -= event.amount;
    }
  }
  if (openCost < -0.05) return null;
  const value = Math.round((cash + Math.max(0, openCost)) * 100) / 100;
  return value > 0 ? value : null;
}

export function ticketBrokeSize(amountUsd: number, portfolioUsd: number, fraction: number): boolean {
  if (!(amountUsd > 0) || !(portfolioUsd > 0) || !(fraction > 0)) return false;
  return amountUsd > portfolioUsd * fraction + 0.001;
}

/**
 * A past ticket was over `slack` times the portfolio fraction at its own entry.
 * The next-ticket ceiling is a different number. A fill whose entry portfolio
 * cannot be rebuilt is not over the line.
 */
export function overEntryShare(
  trade: { entryAt?: string; amountUsd?: number },
  book: PortfolioTrade[],
  options: {
    accountUsd?: number | null;
    cashUsd?: number | null;
    opens?: OpenCost[] | null;
    fraction: number;
    slack?: number;
  },
): boolean {
  const amount = trade.amountUsd ?? 0;
  if (!trade.entryAt || !(amount > 0)) return false;
  const portfolio = portfolioAtEntry(trade.entryAt, book, options.accountUsd, {
    cashUsd: options.cashUsd,
    opens: options.opens,
  });
  if (portfolio == null) return false;
  const slack = options.slack != null && options.slack > 0 ? options.slack : 1;
  return ticketBrokeSize(amount, portfolio, options.fraction * slack);
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
  /** Portfolio reconstructed at the entry, when the book could support one. */
  portfolioUsd: number | null;
}

export function ruleBreak(
  trade: RuledTrade,
  book: PortfolioTrade[],
  options?: { rules?: TradingRule[] | null; accountUsd?: number | null; cashUsd?: number | null; opens?: OpenCost[] | null },
): RuleBreak {
  const stop = activeStopRule(options?.rules);
  const size = activeSizeRule(options?.rules);
  const parts: string[] = [];
  let missedStop = false;
  let oversized = false;
  let portfolio: number | null = null;
  if (stop && exitedBelowStop(trade, stop.fraction)) {
    missedStop = true;
    parts.push(`Exited below ${Math.round(stop.fraction * 100)}% of the entry. That broke “${stop.text}”.`);
  }
  if (size) {
    portfolio = portfolioAtEntry(trade.entryAt, book, options?.accountUsd, {
      cashUsd: options?.cashUsd,
      opens: options?.opens,
    });
    if (portfolio != null && ticketBrokeSize(trade.amountUsd, portfolio, size.fraction)) {
      oversized = true;
      parts.push(sizeBreakNote(trade.amountUsd, portfolio, size.fraction, size.text));
    }
  }
  return { stop: missedStop, size: oversized, note: parts.join(" "), portfolioUsd: portfolio };
}

export function dayBreachSentence(
  pastStop: { pnlUsd: number }[],
  oversized: { pnlUsd: number; amountUsd?: number; portfolioUsd?: number | null }[],
  rules?: TradingRule[] | null,
  closedCount?: number,
): string {
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
    const example = entrySizeExample(oversized, size.fraction);
    const detail = example ? ` ${example}` : "";
    parts.push(
      `${oversized.length} ${noun} more than ${pct}% of the portfolio at the entry${won}.${detail} That broke “${size.text}”.`,
    );
  }
  const pace = activePaceRule(rules);
  if (pace && closedCount != null && closedCount > pace.limit) {
    parts.push(`${closedCount} closed trades. The rule is ${pace.limit}. That broke “${pace.text}”.`);
  }
  return parts.join(" ");
}

function sizeBreakNote(amountUsd: number, portfolioUsd: number, fraction: number, ruleText: string): string {
  const pct = Math.round(fraction * 100);
  const ceiling = portfolioUsd * fraction;
  return `The ${fmtUsdPlain(amountUsd)} ticket was more than ${pct}% of the portfolio at the entry: ${fmtUsdPlain(amountUsd)} against a ${fmtUsdPlain(ceiling)} line on a ${fmtUsdPlain(portfolioUsd)} portfolio. That broke “${ruleText}”.`;
}

function entrySizeExample(
  oversized: { pnlUsd: number; amountUsd?: number; portfolioUsd?: number | null }[],
  fraction: number,
): string {
  const named = oversized.filter((trade) => (trade.amountUsd ?? 0) > 0 && (trade.portfolioUsd ?? 0) > 0);
  if (named.length === 0) return "";
  const winner = named.find((trade) => trade.pnlUsd > 0);
  const pick = winner ?? named.reduce((best, trade) => ((trade.amountUsd ?? 0) > (best.amountUsd ?? 0) ? trade : best));
  const portfolio = pick.portfolioUsd ?? 0;
  const amount = pick.amountUsd ?? 0;
  const pct = Math.round(fraction * 100);
  return `The ${fmtUsdPlain(amount)} ticket was over the ${fmtUsdPlain(portfolio * fraction)} line, ${pct}% of the ${fmtUsdPlain(portfolio)} portfolio at that entry.`;
}

function looksLikeDailyTradeCap(text: string): boolean {
  return /\btrades?\b/i.test(text) && /\bday\b/i.test(text) && /\d+/.test(text);
}

function readTradeCap(text: string): number | null {
  const match = text.match(/(\d+)\s*trades?\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
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
