import { median } from "@/lib/analysis/stats";
import type { TradingRule } from "@/lib/rules";

/** Share of the wallet a single tip may assign when the trader has not set a size. */
export const ACCOUNT_TICKET_SHARE = 0.05;

export interface BookBounds {
  accountUsd: number | null;
  /** The ticket a tip is allowed to name. */
  ticketUsd: number;
  ticketReason: "winners" | "rule" | "account" | "account-rule";
  /** Market-cap line from an active rule, when the trader wrote one. */
  maxMcUsd: number | null;
  sizeRule: string | null;
  mcRule: string | null;
  onePerCoin: string | null;
  overnightRule: string | null;
}

export function bookBounds(input: {
  trades: { amountUsd: number; pnlUsd: number }[];
  rules?: TradingRule[];
  accountUsd?: number | null;
}): BookBounds {
  const active = (input.rules ?? []).filter((rule) => rule.active && rule.text.trim());
  const own = ownTicket(input.trades);
  let exact: number | null = null;
  let maxTicket: number | null = null;
  let maxMc: number | null = null;
  let sizeRule: string | null = null;
  let mcRule: string | null = null;
  let onePerCoin: string | null = null;
  let overnightRule: string | null = null;

  for (const rule of active) {
    const text = rule.text.trim();
    const lower = text.toLowerCase();
    if (/one ticket|one coin|per coin|single ticket/.test(lower)) onePerCoin = text;
    if (/overnight|10\s*pm|after 10|flat at night/.test(lower)) overnightRule = text;
    for (const found of findAmounts(text)) {
      if (found.kind === "mc") {
        if (maxMc === null || found.value < maxMc) {
          maxMc = found.value;
          mcRule = text;
        }
        continue;
      }
      if (found.mode === "exact") {
        if (exact === null || found.value < exact) {
          exact = found.value;
          sizeRule = text;
        }
      } else if (maxTicket === null || found.value < maxTicket) {
        maxTicket = found.value;
        sizeRule = text;
      }
    }
  }

  const accountUsd = input.accountUsd != null && input.accountUsd > 0 ? input.accountUsd : null;
  let ticket = exact ?? own;
  if (maxTicket != null) ticket = Math.min(ticket, maxTicket);
  let reason: BookBounds["ticketReason"] = exact != null || maxTicket != null ? "rule" : "winners";

  if (!Number.isFinite(ticket) || ticket <= 0) ticket = exact ?? maxTicket ?? own;

  if (accountUsd != null) {
    const slice = accountUsd * ACCOUNT_TICKET_SHARE;
    const accountCap = exact != null ? accountUsd : Math.min(accountUsd, slice);
    if (ticket > accountCap) {
      ticket = accountCap;
      reason = reason === "rule" ? "account-rule" : "account";
    }
  }

  return {
    accountUsd,
    ticketUsd: roundMoney(ticket),
    ticketReason: reason,
    maxMcUsd: maxMc,
    sizeRule,
    mcRule,
    onePerCoin,
    overnightRule,
  };
}

export function clampTicketAmounts(text: string, maxUsd: number): string {
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) return text;
  return text.replace(/\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(?![kKmMbB])/g, (full, raw: string) => {
    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 1000 && value <= maxUsd + 0.009) return full;
    if (value >= 1000) return full;
    return formatDollars(maxUsd);
  });
}

function ownTicket(trades: { amountUsd: number; pnlUsd: number }[]): number {
  const winners = trades.filter((trade) => trade.pnlUsd > 0 && trade.amountUsd > 0);
  const pool = winners.length >= 3 ? winners : trades.filter((trade) => trade.amountUsd > 0);
  const value = median(pool.map((trade) => trade.amountUsd));
  return value > 0 ? value : 0;
}

function findAmounts(text: string): { value: number; kind: "ticket" | "mc"; mode: "exact" | "ceiling" }[] {
  const found: { value: number; kind: "ticket" | "mc"; mode: "exact" | "ceiling" }[] = [];
  const pattern = /\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*[kKmMbB]?|\$?\d+(?:\.\d+)?\s*[kKmMbB]?/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const value = parseAmount(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 48), index).toLowerCase();
    const after = text.slice(index, index + raw.length + 24).toLowerCase();
    const around = `${before} ${after}`;
    const suffixed = /[kKmMbB]\s*$/.test(raw);
    const kind: "ticket" | "mc" =
      /market cap|mcap|\bmc\b/.test(around) || suffixed || value >= 1000 ? "mc" : "ticket";
    const mode: "exact" | "ceiling" =
      kind === "ticket" && /\b(is|equals|stay at|stays at|set to|preset)\b/.test(before) && !/under|below|max|at most|no more|nothing|cap|over|above/.test(before)
        ? "exact"
        : "ceiling";
    found.push({ value, kind, mode });
  }
  return found;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const suffix = cleaned.slice(-1).toLowerCase();
  const number = Number.parseFloat(cleaned);
  if (!Number.isFinite(number)) return 0;
  if (suffix === "k") return number * 1_000;
  if (suffix === "m") return number * 1_000_000;
  if (suffix === "b") return number * 1_000_000_000;
  return number;
}

function roundMoney(value: number): number {
  if (value >= 100) return Math.round(value);
  return Math.round(value * 100) / 100;
}

function formatDollars(value: number): string {
  const rounded = roundMoney(value);
  if (rounded >= 100) return `$${Math.round(rounded).toLocaleString("en-US")}`;
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) return `$${Math.round(rounded)}`;
  return `$${rounded.toFixed(2)}`;
}
