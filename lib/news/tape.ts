import { fmtMc, fmtPct } from "@/lib/format";
import type { AttentionCoin } from "@/lib/news/types";

/** What the boosted pairs are doing. Counts only, from the pairs that came back. */
export function tapeSentence(coins: readonly AttentionCoin[]): string | null {
  if (coins.length === 0) return null;
  const up = coins.filter((coin) => (coin.changePct ?? 0) > 0).length;
  const down = coins.filter((coin) => (coin.changePct ?? 0) < 0).length;
  const churn = coins.filter((coin) => coin.volumeUsd != null && coin.marketCapUsd != null && coin.volumeUsd > coin.marketCapUsd).length;
  const widest = coins.reduce<AttentionCoin | null>((best, coin) => {
    if (coin.changePct == null) return best;
    if (!best || best.changePct == null || Math.abs(coin.changePct) > Math.abs(best.changePct)) return coin;
    return best;
  }, null);
  const heaviest = coins.reduce<AttentionCoin | null>((best, coin) => {
    if (coin.volumeUsd == null) return best;
    if (!best || best.volumeUsd == null || coin.volumeUsd > best.volumeUsd) return coin;
    return best;
  }, null);

  const pair = coins.length === 1 ? "pair is" : "pairs are";
  const day = dayClause(up, down);
  const rush = churn === 0 ? "None have more 24-hour volume than market cap." : churn === 1 ? "1 has more 24-hour volume than market cap." : `${churn} have more 24-hour volume than market cap.`;
  const move = widest?.changePct == null ? "" : ` Widest day move: ${widest.symbol} ${fmtPct(widest.changePct, 1)}.`;
  const volume = heaviest?.volumeUsd == null ? "" : ` Heaviest volume: ${heaviest.symbol} ${fmtMc(heaviest.volumeUsd)}.`;
  return `${coins.length} boosted ${pair} on this read. ${day} ${rush}${move}${volume}`;
}

function dayClause(up: number, down: number): string {
  if (up === 0 && down === 0) return "No day change came back with them.";
  if (up > 0 && down > 0) return `${up} up and ${down} down on the day.`;
  if (up > 0) return `${up} up on the day.`;
  return `${down} down on the day.`;
}
