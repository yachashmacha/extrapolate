import type { TerminalId } from "@/lib/types";

export interface TerminalOption {
  id: TerminalId;
  name: string;
  detail: string;
}

export const TERMINALS: TerminalOption[] = [
  { id: "axiom", name: "Axiom", detail: "Web terminal" },
  { id: "photon", name: "Photon", detail: "Web terminal" },
  { id: "bullx", name: "BullX", detail: "Web terminal" },
  { id: "gmgn", name: "GMGN", detail: "Web terminal" },
  { id: "padre", name: "Padre", detail: "Web terminal" },
  { id: "bloom", name: "Bloom", detail: "Bot" },
  { id: "trojan", name: "Trojan", detail: "Bot" },
  { id: "banana", name: "Banana Gun", detail: "Bot" },
  { id: "pump", name: "Pump.fun", detail: "Direct" },
  { id: "wallet", name: "Wallet only", detail: "No terminal" },
];

export function terminalName(id: TerminalId): string {
  return TERMINALS.find((terminal) => terminal.id === id)?.name ?? "your terminal";
}

export function isTerminalId(value: string | null | undefined): value is TerminalId {
  return TERMINALS.some((terminal) => terminal.id === value);
}
