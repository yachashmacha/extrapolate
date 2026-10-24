import { kolFromSpec } from "@/lib/kols";
import { isMetaId } from "@/lib/metas";
import type { Book, RoundTrip, TerminalId } from "@/lib/types";

const HEADER = [
  "symbol",
  "name",
  "mint",
  "meta",
  "entry_time",
  "exit_time",
  "entry_mc",
  "amount_usd",
  "pnl_usd",
  "liquidity_usd",
  "kols",
  "minutes_from_launch",
] as const;

export const CSV_TEMPLATE = `symbol,name,mint,meta,entry_time,exit_time,entry_mc,amount_usd,pnl_usd,liquidity_usd,kols,minutes_from_launch
BONKO,The Bonko,,animal,2026-10-01T14:12:00Z,2026-10-01T14:34:00Z,28000,150,96,52000,orangie:before|cented:before,40`;

export function parseCsvBook(text: string, terminal: TerminalId): Book {
  const rows = parseRows(text);
  if (rows.length === 0) throw new Error("The CSV is empty.");
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const missing = HEADER.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(`Missing columns: ${missing.join(", ")}.`);
  }
  const index = new Map(header.map((column, position) => [column, position]));
  const trades: RoundTrip[] = [];
  const problems: string[] = [];

  rows.slice(1).forEach((row, rowIndex) => {
    if (row.every((cell) => cell.trim() === "")) return;
    const cell = (column: string) => row[index.get(column) ?? -1]?.trim() ?? "";
    const symbol = cell("symbol").toUpperCase();
    const entryAt = cell("entry_time");
    const exitAt = cell("exit_time");
    const amount = Number(cell("amount_usd"));
    const pnl = Number(cell("pnl_usd"));
    if (!symbol || !entryAt || !exitAt || !Number.isFinite(amount) || !Number.isFinite(pnl)) {
      problems.push(`Row ${rowIndex + 2} is missing a symbol, time, size, or PnL.`);
      return;
    }
    const entryMs = Date.parse(entryAt);
    const exitMs = Date.parse(exitAt);
    if (Number.isNaN(entryMs) || Number.isNaN(exitMs)) {
      problems.push(`Row ${rowIndex + 2} has a clock the desk could not read.`);
      return;
    }
    const meta = cell("meta").toLowerCase();
    const metas = isMetaId(meta) ? [meta] : ["other" as const];
    const kols = cell("kols")
      .split("|")
      .map((spec) => spec.trim())
      .filter(Boolean)
      .map((spec) => kolFromSpec(spec));
    const launch = Number(cell("minutes_from_launch"));
    trades.push({
      id: `csv-${rowIndex + 2}-${symbol.toLowerCase()}`,
      mint: cell("mint") || `csv:${symbol.toLowerCase()}`,
      symbol,
      name: cell("name") || symbol,
      metas,
      terminal,
      entryAt: new Date(entryMs).toISOString(),
      exitAt: new Date(exitMs).toISOString(),
      entryMarketCapUsd: numberOrZero(cell("entry_mc")),
      exitMarketCapUsd: 0,
      liquidityUsd: numberOrZero(cell("liquidity_usd")),
      amountUsd: amount,
      pnlUsd: Math.round(pnl * 100) / 100,
      pnlPct: amount !== 0 ? (pnl / amount) * 100 : 0,
      holdMinutes: Math.max(0, (exitMs - entryMs) / 60_000),
      kols,
      minutesFromLaunch: Number.isFinite(launch) ? launch : -1,
      buys: 1,
      sells: 1,
    });
  });

  if (trades.length === 0) {
    throw new Error(problems[0] ?? "No trades were readable in that CSV.");
  }

  return {
    source: "csv",
    terminal,
    label: "Imported book",
    trades,
    opens: [],
    warnings: [
      "Imported from CSV. Market cap, liquidity, and KOLs are whatever the file said.",
      ...problems,
    ],
    fetchedAt: new Date().toISOString(),
  };
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}
