const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdExact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtUsd(value: number, exact = false): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const formatted = abs < 100 || exact ? usdExact.format(abs) : usd.format(abs);
  if (value < 0) return `−${formatted}`;
  if (value > 0) return `+${formatted}`;
  return formatted;
}

export function fmtUsdPlain(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 100) return usd.format(abs);
  if (Math.abs(abs - Math.round(abs)) < 0.001) return usd.format(abs);
  return usdCents.format(abs);
}

export function fmtMc(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000) {
    const n = value / 1_000_000;
    return `$${trim(n)}M`;
  }
  if (value >= 1_000) {
    const n = value / 1_000;
    return `$${trim(n)}k`;
  }
  return usd.format(value);
}

export function fmtPct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = value.toFixed(digits);
  if (value > 0) return `+${rounded}%`;
  if (value < 0) return `−${Math.abs(Number(rounded))}%`;
  return `${rounded}%`;
}

export function fmtRate(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function fmtHold(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 90) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${trim(hours)}h`;
  return `${trim(hours / 24)}d`;
}

export function fmtWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function hourEt(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "0";
  return Number(hour);
}

export function sessionOf(hour: number): "Morning" | "Midday" | "Evening" | "Overnight" {
  if (hour >= 6 && hour < 11) return "Morning";
  if (hour >= 11 && hour < 17) return "Midday";
  if (hour >= 17 && hour < 22) return "Evening";
  return "Overnight";
}

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function trim(value: number): string {
  const fixed = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return fixed.replace(/\.0$/, "");
}
