import { fmtMc, fmtUsdPlain } from "@/lib/format";
import { isWalletAddress } from "@/lib/address";
import { kolLabel } from "@/lib/kols";
import { META_LABEL } from "@/lib/metas";
import { net, winRate } from "@/lib/analysis/stats";
import type { KolTag, KolTiming, MetaId, RoundTrip } from "@/lib/types";

export interface NarrativeScore {
  /** Integer 1–10. The coin's story. The day's rationality percent only feels this as a small nudge. */
  score: number;
  /** The one or two factors that set the score. */
  factors: string[];
  /** Those factors in one line. */
  line: string;
}

interface Piece {
  id: "callers" | "catalyst" | "record" | "run" | "timing";
  points: number;
  text: string;
  /** False when the book never read this factor, so it is not shown and not guessed. */
  read: boolean;
}

const WEIGHT: Record<Piece["id"], number> = {
  callers: 0,
  catalyst: 1,
  record: 2,
  run: 3,
  timing: 4,
};

/**
 * Narrative score, an integer 1–10, for the coin's story. It is not the day's
 * rationality percent. Ticket size and the percent of the coin or the pool are
 * not factors. A graduation is not stored on these fills, so it is not scored.
 *
 * The pieces still add on a 0–100 scale, heaviest first:
 * Callers, max 36: 16 for the first caller in before or with the entry, then 12,
 * then 8, then 6 each. A caller after the entry is 6, then 4, then 3 each.
 * Several independent callers add; none does not zero the rest.
 * Catalyst, max 20: 16 for a named tag, plus 4 for a second. Unsorted is 4.
 * Record, max 18: earlier closed coins in this book in the same narrative, excluding
 * this mint. None is 0, and the line says so. A green record (win rate at least 50%
 * and net green) scales up to 18 once three comps exist; a mixed record is about half;
 * a red record is 3 at a full sample.
 * Run, max 16, skipped when the stored high or the entry market cap is missing:
 * how far that high got past the entry (an 8× run saturates) blended with the high
 * itself. The line says "Ran to".
 * Timing, max 10, skipped when the high is missing: entry at or under 35% of the
 * high is 10, the lower half is 6, already up the range is 2, and near the high is 0.
 * That timing is not the FOMO rule.
 * Shown score = round(1 + 9 × raw / 100), clamped to 1–10.
 * The line is the two factors with the most points. The bare tag is left off only
 * when the record scored at least as much and is already on the line. A long caller
 * list names three and counts the rest.
 */
export function narrativeScore(trade: RoundTrip, book: RoundTrip[]): NarrativeScore {
  const pieces = [
    callerPiece(trade.kols),
    catalystPiece(trade),
    recordPiece(trade, book),
    runPiece(trade),
    timingPiece(trade),
  ];
  const factors = leadingFactors(pieces);
  const score = toTen(pieces.reduce((sum, piece) => sum + piece.points, 0));
  return { score, factors, line: factors.join(" ") };
}

/** Copy a stored high onto the trades the tape is showing, without dropping the other fields. */
export function withStoredHigh<T extends RoundTrip>(trades: T[], highsFrom: RoundTrip[]): T[] {
  const highs = new Map<string, number>();
  for (const trade of highsFrom) {
    const high = trade.athMarketCapUsd ?? 0;
    if (high > 0) highs.set(trade.id, high);
  }
  return trades.map((trade) => {
    const high = highs.get(trade.id);
    if (high == null || high === trade.athMarketCapUsd) return trade;
    return { ...trade, athMarketCapUsd: high };
  });
}

function leadingFactors(pieces: Piece[]): string[] {
  const ranked = pieces
    .filter((piece) => piece.read && piece.points > 0 && piece.text)
    .sort((left, right) => right.points - left.points || WEIGHT[left.id] - WEIGHT[right.id]);
  const chosen = ranked.slice(0, 2);
  const catalyst = pieces.find((piece) => piece.id === "catalyst");
  const record = pieces.find((piece) => piece.id === "record");
  if (
    catalyst &&
    record &&
    record.points >= catalyst.points &&
    chosen.some((piece) => piece.id === "record") &&
    chosen.some((piece) => piece.id === "catalyst")
  ) {
    const next = ranked.find((piece) => piece.id !== "catalyst" && !chosen.includes(piece));
    const withoutTag = chosen.filter((piece) => piece.id !== "catalyst");
    if (next) withoutTag.push(next);
    withoutTag.sort((left, right) => right.points - left.points || WEIGHT[left.id] - WEIGHT[right.id]);
    chosen.splice(0, chosen.length, ...withoutTag);
  }
  const lines = chosen.map((piece) => piece.text);
  if (lines.length < 2 && record?.read && record.points === 0 && record.text && !lines.includes(record.text)) {
    lines.push(record.text);
  }
  const run = pieces.find((piece) => piece.id === "run");
  if (lines.length < 2 && run?.read && run.points === 0 && run.text && !lines.includes(run.text)) {
    lines.push(run.text);
  }
  return lines.slice(0, 2);
}

function callerPiece(kols: KolTag[]): Piece {
  const unique = dedupe(kols);
  if (unique.length === 0) {
    return { id: "callers", points: 0, text: "No tracked caller on this coin.", read: true };
  }
  const before = unique.filter((kol) => kol.timing === "before");
  const alongside = unique.filter((kol) => kol.timing === "with");
  const after = unique.filter((kol) => kol.timing === "after");
  const points = Math.min(36, tiered(before.length + alongside.length, 16, 4, 6) + tiered(after.length, 6, 2, 3));
  const clauses = [callerClause(before, "before"), callerClause(alongside, "with"), callerClause(after, "after")].filter(
    (clause) => clause.length > 0,
  );
  return { id: "callers", points, text: `${clauses.join("; ")}.`, read: true };
}

function catalystPiece(trade: RoundTrip): Piece {
  const named = trade.metas.filter((meta) => meta !== "other").slice(0, 2);
  if (named.length === 0) {
    return { id: "catalyst", points: 4, text: "No named narrative on the coin.", read: true };
  }
  const labels = named.map((meta) => META_LABEL[meta]);
  const points = named.length > 1 ? 20 : 16;
  const text = labels.length > 1 ? `The narrative is ${labels[0]} and ${labels[1]}.` : `The narrative is ${labels[0]}.`;
  return { id: "catalyst", points, text, read: true };
}

function recordPiece(trade: RoundTrip, book: RoundTrip[]): Piece {
  const metas = narrativesOf(trade);
  let bestMeta = metas[0] ?? "other";
  let bestPriors: RoundTrip[] = [];
  let bestPoints = 0;
  metas.forEach((meta, index) => {
    const priors = earlierInNarrative(trade, book, meta);
    const points = recordPoints(priors);
    const better = points > bestPoints || (points === bestPoints && priors.length > bestPriors.length);
    if (index === 0 || better) {
      bestMeta = meta;
      bestPriors = priors;
      bestPoints = points;
    }
  });
  return { id: "record", points: bestPoints, text: recordText(bestMeta, bestPriors), read: true };
}

function runPiece(trade: RoundTrip): Piece {
  const high = trade.athMarketCapUsd ?? 0;
  const entry = trade.entryMarketCapUsd;
  if (!(high > 0) || !(entry > 0)) return { id: "run", points: 0, text: "", read: false };
  const multiple = high / entry;
  if (multiple < 1.2) {
    return { id: "run", points: 0, text: `Never left the ${fmtMc(entry)} entry.`, read: true };
  }
  const multipleScore = Math.min(1, Math.log(multiple) / Math.log(8));
  const levelScore = Math.min(1, Math.max(0, Math.log10(high / 10_000)) / 2);
  const points = Math.min(16, Math.max(1, Math.round(16 * (0.7 * multipleScore + 0.3 * levelScore))));
  return { id: "run", points, text: `Ran to ${fmtMc(high)}.`, read: true };
}

function timingPiece(trade: RoundTrip): Piece {
  const high = trade.athMarketCapUsd ?? 0;
  const entry = trade.entryMarketCapUsd;
  if (!(high > 0) || !(entry > 0)) return { id: "timing", points: 0, text: "", read: false };
  const ratio = entry / high;
  if (ratio <= 0.35) return { id: "timing", points: 10, text: "Entry was early in the range it reached.", read: true };
  if (ratio <= 0.55) return { id: "timing", points: 6, text: "Entry sat in the lower half of the range it reached.", read: true };
  if (ratio <= 0.8) return { id: "timing", points: 2, text: "Entry was already well up the range it reached.", read: true };
  return { id: "timing", points: 0, text: "Entry was already extended, near the high it reached.", read: true };
}

function recordPoints(priors: RoundTrip[]): number {
  if (priors.length === 0) return 0;
  const sample = Math.min(1, priors.length / 3);
  const rate = winRate(priors);
  const pnl = net(priors);
  let quality = 3 / 18;
  if (pnl > 0 && rate >= 0.5) {
    const lift = Math.min(1, (rate - 0.5) / 0.5);
    quality = 0.72 + 0.28 * lift;
  } else if (pnl > 0 || rate >= 0.5 || pnl === 0) {
    quality = 0.5;
  }
  return Math.round(18 * sample * quality);
}

function recordText(meta: MetaId, priors: RoundTrip[]): string {
  const label = META_LABEL[meta];
  if (priors.length === 0) return `No earlier ${label} coin in this book.`;
  const wins = priors.filter((prior) => prior.pnlUsd > 0).length;
  const pnl = net(priors);
  const outcome = pnl > 0 ? `up ${fmtUsdPlain(pnl)}` : pnl < 0 ? `down ${fmtUsdPlain(Math.abs(pnl))}` : "flat";
  if (priors.length === 1) return `The earlier ${label} coin in this book finished ${outcome}.`;
  return `${label} is ${wins} of ${priors.length} in this book, ${outcome}.`;
}

function earlierInNarrative(trade: RoundTrip, book: RoundTrip[], meta: MetaId): RoundTrip[] {
  return book.filter((other) => {
    if (other.id === trade.id || other.mint === trade.mint) return false;
    if (!(other.exitAt < trade.entryAt)) return false;
    return narrativesOf(other).includes(meta);
  });
}

function narrativesOf(trade: RoundTrip): MetaId[] {
  const named = trade.metas.filter((meta) => meta !== "other");
  return named.length > 0 ? named : ["other"];
}

function callerClause(group: KolTag[], when: KolTiming): string {
  if (group.length === 0) return "";
  const named: string[] = [];
  let hidden = 0;
  const seen = new Set<string>();
  for (const kol of group) {
    const label = publicName(kol);
    if (!label) {
      hidden += 1;
      continue;
    }
    if (seen.has(label)) continue;
    seen.add(label);
    named.push(label);
  }
  const verb =
    when === "after"
      ? "showed up after the entry"
      : when === "with"
        ? group.length === 1
          ? "was in with the entry"
          : "were in with the entry"
        : group.length === 1
          ? "was in before the entry"
          : "were in before the entry";
  if (named.length === 0) return `${group.length === 1 ? "A caller" : `${group.length} callers`} ${verb}`;
  if (hidden === 0 && named.length === group.length) {
    if (named.length <= 3) return `${joinAnd(named)} ${verb}`;
    const head = named.slice(0, 3);
    return `${head.join(", ")}, and ${group.length - head.length} more ${verb}`;
  }
  return `${group.length} callers ${verb}, including ${joinAnd(named.slice(0, 3))}`;
}

function publicName(kol: KolTag): string {
  const label = kolLabel(kol).trim();
  const wallet = kol.wallet || (isWalletAddress(kol.handle) ? kol.handle : "");
  if (!label || label.includes("…") || isWalletAddress(label) || isWalletAddress(kol.name)) return "";
  if (wallet && label.includes(wallet)) return "";
  return label;
}

function dedupe(kols: KolTag[]): KolTag[] {
  const seen = new Map<string, KolTag>();
  for (const kol of kols) {
    if (!seen.has(kol.id)) seen.set(kol.id, kol);
  }
  return [...seen.values()];
}

function tiered(count: number, first: number, step: number, floor: number): number {
  let total = 0;
  for (let index = 0; index < count; index += 1) total += Math.max(floor, first - index * step);
  return total;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** Map the weighted 0–100 pieces onto an integer from 1 to 10. */
function toTen(raw: number): number {
  const bounded = Math.max(0, Math.min(100, Math.round(raw)));
  return Math.max(1, Math.min(10, Math.round(1 + (bounded / 100) * 9)));
}
