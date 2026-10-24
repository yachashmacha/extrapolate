export interface TradingRule {
  id: string;
  text: string;
  active: boolean;
}

export function parseRules(raw: string | null): TradingRule[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { id?: unknown; text?: unknown; active?: unknown };
      if (typeof row.id !== "string" || typeof row.text !== "string") return [];
      const text = row.text.trim();
      if (!text) return [];
      return [{ id: row.id, text, active: row.active !== false }];
    });
  } catch {
    return [];
  }
}
