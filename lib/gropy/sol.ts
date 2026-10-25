export function fmtSol(value: number, signed = false): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs === 0 ? 0 : abs >= 100 ? 2 : abs >= 1 ? 3 : 4;
  const text = abs.toFixed(digits);
  if (value < 0) return `−${text} SOL`;
  if (signed && value > 0) return `+${text} SOL`;
  return `${text} SOL`;
}
