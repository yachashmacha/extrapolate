export interface WeekTicker {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  changePct: number;
}

export interface WeekBoard {
  tickers: WeekTicker[];
  loadedAt: string;
}

export interface WeekQuote {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number;
  changePct: number | null;
}

export type WeekPoint = [number, number];

const BOARD = 10;
const POOL = 100;
const OUTLIER = 400;
const MIN_SPAN_MS = 5 * 24 * 60 * 60 * 1000;
const CACHE_MS = 45_000;
const MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=7d";

/** Pegs are not a week’s board. A flat dollar is not a ticker this desk is reading. */
const STABLES = new Set([
  "usdt", "usdc", "dai", "usde", "usd1", "usdg", "fdusd", "tusd", "usds", "pyusd",
  "usdd", "susd", "gusd", "usdp", "frax", "lusd", "rlusd", "crvusd", "gho", "usdy", "ousd",
]);

let cached: { at: number; board: WeekBoard } | null = null;

export async function loadWeek(): Promise<WeekBoard> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.board;
  const board = await assembleWeek(fetch);
  cached = { at: Date.now(), board };
  return board;
}

export async function assembleWeek(fetchImpl: typeof fetch, now = Date.now()): Promise<WeekBoard> {
  const loadedAt = new Date(now).toISOString();
  try {
    const quotes = (await readMarkets(fetchImpl)).filter((quote) => !STABLES.has(quote.symbol.toLowerCase()));
    const outliers = quotes.filter((quote) => quote.changePct != null && Math.abs(quote.changePct) > OUTLIER).slice(0, 8);
    const charts = new Map<string, WeekPoint[]>();
    await Promise.all(
      outliers.map(async (quote) => {
        charts.set(quote.id, await readChart(fetchImpl, quote.id));
      }),
    );
    return { tickers: selectWeek(quotes, charts, now), loadedAt };
  } catch {
    return { tickers: [], loadedAt };
  }
}

/** Ten largest coins with the strongest move across the last seven days. */
export function selectWeek(quotes: WeekQuote[], charts: ReadonlyMap<string, WeekPoint[]>, now = Date.now()): WeekTicker[] {
  const ranked: WeekTicker[] = [];
  const seen = new Set<string>();
  const ordered = [...quotes].sort((left, right) => right.marketCapUsd - left.marketCapUsd).slice(0, POOL);
  for (const quote of ordered) {
    if (seen.has(quote.id) || !quote.id || !(quote.priceUsd > 0) || !(quote.marketCapUsd > 0)) continue;
    if (STABLES.has(quote.symbol.trim().toLowerCase())) continue;
    const symbol = displaySymbol(quote.symbol);
    if (!symbol) continue;
    const chart = charts.get(quote.id);
    const fromChart = chart ? weekMove(chart, now) : null;
    let changePct = quote.changePct;
    if (fromChart != null) changePct = fromChart;
    else if (chart) continue;
    else if (changePct == null || !Number.isFinite(changePct) || Math.abs(changePct) > OUTLIER) continue;
    seen.add(quote.id);
    ranked.push({ id: quote.id, symbol, name: quote.name.trim() || symbol, priceUsd: quote.priceUsd, changePct });
  }
  return ranked.sort((left, right) => right.changePct - left.changePct).slice(0, BOARD);
}

export function weekMove(prices: WeekPoint[], now = Date.now()): number | null {
  const points = prices
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]) && point[1] > 0)
    .sort((left, right) => left[0] - right[0]);
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (last[0] - first[0] < MIN_SPAN_MS) return null;
  if (now - last[0] > 2 * 24 * 60 * 60 * 1000) return null;
  const change = ((last[1] - first[1]) / first[1]) * 100;
  return Number.isFinite(change) ? change : null;
}

async function readMarkets(fetchImpl: typeof fetch): Promise<WeekQuote[]> {
  const response = await fetchImpl(MARKETS_URL, {
    headers: { accept: "application/json", "user-agent": "extrapolate-desk/1.0" },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(String(response.status));
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) return [];
  return body.flatMap((row) => {
    const quote = parseQuote(row);
    return quote ? [quote] : [];
  });
}

async function readChart(fetchImpl: typeof fetch, id: string): Promise<WeekPoint[]> {
  try {
    const response = await fetchImpl(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=7`,
      {
        headers: { accept: "application/json", "user-agent": "extrapolate-desk/1.0" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { prices?: unknown };
    if (!Array.isArray(body.prices)) return [];
    return body.prices.flatMap((point) => {
      if (!Array.isArray(point) || point.length < 2) return [];
      const time = Number(point[0]);
      const price = Number(point[1]);
      return Number.isFinite(time) && Number.isFinite(price) ? [[time, price] as WeekPoint] : [];
    });
  } catch {
    return [];
  }
}

function parseQuote(row: unknown): WeekQuote | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const symbol = typeof record.symbol === "string" ? record.symbol : "";
  const name = typeof record.name === "string" ? record.name : "";
  const priceUsd = typeof record.current_price === "number" ? record.current_price : Number.NaN;
  const marketCapUsd = typeof record.market_cap === "number" ? record.market_cap : Number.NaN;
  const raw = record.price_change_percentage_7d_in_currency;
  const changePct = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  if (!id || !symbol) return null;
  return { id, symbol, name, priceUsd, marketCapUsd, changePct };
}

function displaySymbol(symbol: string): string {
  const clean = symbol.trim();
  if (!clean) return "";
  return /^[a-z0-9]+$/i.test(clean) ? clean.toUpperCase() : clean;
}
