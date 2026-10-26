export interface ExtraHardRule {
  id: string;
  text: string;
  active: boolean;
}

export interface GropyHardRules {
  stopOn: boolean;
  stopPercent: string;
  takeProfitOn: boolean;
  takeProfitPercent: string;
  maxSolOn: boolean;
  maxSol: string;
  dailyLossOn: boolean;
  dailyLossSol: string;
  extras: ExtraHardRule[];
}

export const EMPTY_HARD_RULES: GropyHardRules = {
  stopOn: false,
  stopPercent: "",
  takeProfitOn: false,
  takeProfitPercent: "",
  maxSolOn: false,
  maxSol: "",
  dailyLossOn: false,
  dailyLossSol: "",
  extras: [],
};

export function positiveAmount(text: string): number | null {
  const value = Number(text.trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function parseHardRules(raw: string | null): GropyHardRules {
  if (!raw) return EMPTY_HARD_RULES;
  try {
    const parsed = JSON.parse(raw) as Partial<GropyHardRules>;
    return {
      stopOn: parsed.stopOn === true,
      stopPercent: cleanAmount(parsed.stopPercent),
      takeProfitOn: parsed.takeProfitOn === true,
      takeProfitPercent: cleanAmount(parsed.takeProfitPercent),
      maxSolOn: parsed.maxSolOn === true,
      maxSol: cleanAmount(parsed.maxSol),
      dailyLossOn: parsed.dailyLossOn === true,
      dailyLossSol: cleanAmount(parsed.dailyLossSol),
      extras: Array.isArray(parsed.extras)
        ? parsed.extras.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const row = item as Partial<ExtraHardRule>;
            const text = typeof row.text === "string" ? row.text.trim().slice(0, 240) : "";
            const id = typeof row.id === "string" && row.id ? row.id : "";
            if (!text || !id) return [];
            return [{ id, text, active: row.active !== false }];
          })
        : [],
    };
  } catch {
    return EMPTY_HARD_RULES;
  }
}

/** Lines the bot must follow. A switch with no positive number is not armed. */
export function armedLines(rules: GropyHardRules): string[] {
  const lines: string[] = [];
  const stop = positiveAmount(rules.stopPercent);
  if (rules.stopOn && stop != null) lines.push(`Hard stop: exit a copy ${formatAmount(stop)}% below its entry.`);
  const takeProfit = positiveAmount(rules.takeProfitPercent);
  if (rules.takeProfitOn && takeProfit != null) lines.push(`Take profit: exit a copy ${formatAmount(takeProfit)}% above its entry.`);
  const maxSol = positiveAmount(rules.maxSol);
  if (rules.maxSolOn && maxSol != null) lines.push(`No copy larger than ${formatAmount(maxSol)} SOL.`);
  const dailyLoss = positiveAmount(rules.dailyLossSol);
  if (rules.dailyLossOn && dailyLoss != null) lines.push(`Stop copying for the day after ${formatAmount(dailyLoss)} SOL lost.`);
  for (const extra of rules.extras) {
    const text = extra.text.trim();
    if (extra.active && text) lines.push(text);
  }
  return lines;
}

function cleanAmount(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, 16);
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}
