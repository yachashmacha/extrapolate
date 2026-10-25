import type { TerminalId } from "@/lib/types";

/** The trading wallet this desk reads. Public address, supplied for the live book. */
export const TRADER_WALLET = "3sMvbeAJC9gQvgapgo3FjavtswRh55LE2G98qLxjaAsv";
export const TRADER_TERMINAL: TerminalId = "wallet";
export const TRADER_DEPTH = "250";

export function traderSearch(): string {
  return `?address=${encodeURIComponent(TRADER_WALLET)}&terminal=${TRADER_TERMINAL}&depth=${TRADER_DEPTH}`;
}
