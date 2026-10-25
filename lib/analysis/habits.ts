import { ticketWhy } from "@/lib/analysis/tips";
import type { BookBounds } from "@/lib/analysis/bounds";
import { fomoStatus } from "@/lib/analysis/fomo";
import { houseMoneyIds, revengeIds, sessionName } from "@/lib/analysis/slices";
import { median, net, winRate } from "@/lib/analysis/stats";
import { fmtHold, fmtMc, fmtRate, fmtUsd, fmtUsdPlain } from "@/lib/format";
import { kolLabel } from "@/lib/kols";
import type { KolTiming, RoundTrip } from "@/lib/types";

export type HabitMark = "Bias" | "Fallacy" | "Tendency" | "Repeat";

export interface Habit {
  id: string;
  tone: "positive" | "negative";
  mark: HabitMark;
  title: string;
  detail: string;
  stat: string;
  tradeIds: string[];
}

interface Draft extends Habit {
  impact: number;
}

const OFF_ATH = 0.45;

export function tradingHabits(trades: RoundTrip[], bounds?: BookBounds): { positive: Habit[]; negative: Habit[] } {
  const drafts: Draft[] = [];
  drafts.push(...sizeHabits(trades, bounds));
  drafts.push(...fomoHabits(trades));
  drafts.push(...athHabits(trades));
  drafts.push(...capHabits(trades, bounds));
  drafts.push(...holdHabits(trades));
  drafts.push(...sessionHabits(trades, bounds));
  drafts.push(...addHabits(trades, bounds));
  drafts.push(...poolHabits(trades));
  drafts.push(...reentryHabits(trades));
  drafts.push(...callerHabits(trades, bounds));
  drafts.push(...launchHabits(trades));

  const positive = drafts
    .filter((habit) => habit.tone === "positive")
    .sort(byImpact)
    .slice(0, 6)
    .map(strip);
  const negative = drafts
    .filter((habit) => habit.tone === "negative")
    .sort(byImpact)
    .slice(0, 6)
    .map(strip);
  return { positive, negative };
}

function sizeHabits(trades: RoundTrip[], bounds?: BookBounds): Draft[] {
  const ordered = chronological(trades);
  const usual = median(ordered.map((trade) => trade.amountUsd).filter((value) => value > 0));
  if (usual <= 0) return [];
  const revenge = revengeIds(trades);
  const pressedIds = houseMoneyIds(trades);
  const sizedUp: RoundTrip[] = [];
  const kept: RoundTrip[] = [];
  const pressed: RoundTrip[] = [];
  const keptWin: RoundTrip[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.pnlUsd < 0 && revenge.has(current.id)) sizedUp.push(current);
    if (previous.pnlUsd < 0 && !revenge.has(current.id) && current.amountUsd <= usual * 1.05) kept.push(current);
    if (previous.pnlUsd > 0 && pressedIds.has(current.id)) pressed.push(current);
    if (previous.pnlUsd > 0 && current.amountUsd <= usual * 1.05) keptWin.push(current);
  }
  const out: Draft[] = [];
  const usualLabel = fmtUsdPlain(usual);
  if (worth("negative", sizedUp, kept.length >= 3 ? kept : others(ordered, sizedUp))) {
    out.push(
      draft("size-after-loss", "negative", "Revenge trading", sizedUp, {
        mark: "Bias",
        detail: `Loss-chasing. Within 30 minutes of a red close, ${sizedUp.length} of the next tickets were at least 1.5× the usual ${usualLabel} and at least 1.5× the ticket that just lost. Those dropped ${money(sizedUp)}${including(sizedUp, true)}. ${sizeCloser(sizedUp, bounds)}`,
      }),
    );
  }
  if (worth("positive", kept, sizedUp.length >= 3 ? sizedUp : others(ordered, kept))) {
    out.push(
      draft("size-flat-after-loss", "positive", "Kept the ticket flat after a loss", kept, {
        detail: `After a red close, ${kept.length} of the next tickets stayed at or under the usual ${usualLabel}. Those made ${gained(kept)}${including(kept, false)}. ${sizeCloser(kept, bounds)}`,
      }),
    );
  }
  if (worth("negative", pressed, keptWin.length >= 3 ? keptWin : others(ordered, pressed))) {
    out.push(
      draft("size-after-win", "negative", "House-money effect", pressed, {
        mark: "Bias",
        detail: `Pressing the last win. Within 30 minutes of a green close, ${pressed.length} of the next tickets were at least 1.5× the usual ${usualLabel} and at least 1.5× the winning ticket. Those dropped ${money(pressed)}${including(pressed, true)}. ${sizeCloser(pressed, bounds)}`,
      }),
    );
  }
  if (worth("positive", pressed, others(ordered, pressed)) && net(pressed) > 0) {
    const closer = sizeCloser(pressed, bounds);
    const capped = Boolean(bounds && bounds.ticketUsd > 0 && median(pressed.map((trade) => trade.amountUsd)) > bounds.ticketUsd * 1.05);
    out.push(
      draft(
        "size-press-paid",
        "positive",
        capped ? "A larger ticket after a win stays capped" : "The larger ticket after a win paid",
        pressed,
        {
          detail: capped
            ? `${closer} After a green close, ${pressed.length} larger tickets made ${gained(pressed)}${including(pressed, false)}.`
            : `After a green close, ${pressed.length} larger tickets made ${gained(pressed)}${including(pressed, false)}. ${closer}`,
        },
      ),
    );
  }
  return out;
}

/**
 * FOMO is a buy after which volume started dropping and market cap also dropped.
 * Any market cap. The bond is not the test, and neither is the tape before the
 * fill. If either post-entry read is missing, the fill is not labeled. A buy
 * where volume kept rising, or market cap kept climbing, is not FOMO.
 */
function fomoHabits(trades: RoundTrip[]): Draft[] {
  const chased = trades.filter((trade) => fomoStatus(trade) === "yes");
  const judged = trades.filter((trade) => fomoStatus(trade) === "no");
  const rest = judged.length >= 3 ? judged : others(trades, chased);
  const out: Draft[] = [];
  if (worth("negative", chased, rest)) {
    out.push(
      draft("fomo", "negative", "FOMO", chased, {
        mark: "Bias",
        detail: `Buying the fade. After the entry, volume started dropping and market cap dropped on ${chased.length} fills. Those dropped ${money(chased)}${including(chased, true)}.`,
      }),
    );
  } else if (worth("positive", chased, rest)) {
    out.push(
      draft("fomo-paid", "positive", "Got paid after the tape faded", chased, {
        detail: `After the entry, volume started dropping and market cap dropped on ${chased.length} fills. Those made ${gained(chased)}${including(chased, false)}.`,
      }),
    );
  }
  return out;
}

function athHabits(trades: RoundTrip[]): Draft[] {
  const known = trades.filter((trade) => (trade.athMarketCapUsd ?? 0) > 0 && trade.entryMarketCapUsd > 0);
  if (known.length < 5) return [];
  const off = known.filter((trade) => trade.entryMarketCapUsd <= (trade.athMarketCapUsd ?? 0) * OFF_ATH);
  const out: Draft[] = [];
  if (worth("positive", off, others(known, off))) {
    out.push(
      draft("ath-off", "positive", "Bought well under the high", off, {
        detail: `${off.length} entries were at or under 45% of that coin's ATH. The median entry sat at ${athPct(off)} of the high. Those made ${gained(off)}${including(off, false)}.`,
      }),
    );
  } else if (worth("negative", off, others(known, off))) {
    out.push(
      draft("ath-off-lost", "negative", "Bought under the high and still lost", off, {
        detail: `${off.length} entries were at or under 45% of that coin's ATH. The median entry sat at ${athPct(off)} of the high. Those dropped ${money(off)}${including(off, true)}.`,
      }),
    );
  }
  return out;
}

function capHabits(trades: RoundTrip[], bounds?: BookBounds): Draft[] {
  const pool = trades.filter((trade) => trade.entryMarketCapUsd > 0);
  const winners = pool.filter((trade) => trade.pnlUsd > 0);
  const ref = median((winners.length >= 3 ? winners : pool).map((trade) => trade.entryMarketCapUsd));
  if (ref <= 0) return [];
  const ruleLine = bounds?.maxMcUsd && bounds.maxMcUsd > 0 ? bounds.maxMcUsd : null;
  const out: Draft[] = [];
  if (ruleLine != null) {
    const above = pool.filter((trade) => trade.entryMarketCapUsd > ruleLine * 1.05);
    const below = pool.filter((trade) => trade.entryMarketCapUsd <= ruleLine);
    const rule = bounds?.mcRule ? `Your rule draws that line: “${bounds.mcRule}”.` : "";
    if (worth("negative", above, below)) {
      out.push(
        draft("mc-above-rule", "negative", "Bought above the market-cap rule", above, {
          detail: `${above.length} buys were above ${fmtMc(ruleLine)}. ${rule} Those dropped ${money(above)}${including(above, true)}.`,
        }),
      );
    }
    if (worth("positive", below, above)) {
      out.push(
        draft("mc-inside-rule", "positive", "Stayed under the market-cap rule", below, {
          detail: `${below.length} buys stayed at or under ${fmtMc(ruleLine)}. ${rule} Those made ${gained(below)}${including(below, false)}.`,
        }),
      );
    }
    return out;
  }
  const above = pool.filter((trade) => trade.entryMarketCapUsd > ref * 1.5);
  const below = pool.filter((trade) => trade.entryMarketCapUsd <= ref * 1.1);
  if (worth("negative", above, below)) {
    out.push(
      draft("mc-high", "negative", "Bought the higher caps", above, {
        detail: `The paying entries clustered near ${fmtMc(ref)}. ${above.length} buys were above ${fmtMc(ref * 1.5)}, and those dropped ${money(above)}${including(above, true)}.`,
      }),
    );
  }
  if (worth("positive", below, above)) {
    out.push(
      draft("mc-low", "positive", "Got paid at the smaller caps", below, {
        detail: `${below.length} buys were at or under ${fmtMc(ref * 1.1)}, near the ${fmtMc(ref)} entries that paid. Those made ${gained(below)}${including(below, false)}.`,
      }),
    );
  }
  return out;
}

/**
 * The disposition effect is selling winners and sitting on losers. Name it only
 * when the median losing hold is at least twice the median winning hold and at
 * least five minutes longer. A small gap is not that split.
 */
function holdHabits(trades: RoundTrip[]): Draft[] {
  const winners = trades.filter((trade) => trade.pnlUsd > 0);
  const losers = trades.filter((trade) => trade.pnlUsd < 0);
  if (winners.length < 3 || losers.length < 3) return [];
  const winHold = median(winners.map((trade) => trade.holdMinutes));
  const lossHold = median(losers.map((trade) => trade.holdMinutes));
  const out: Draft[] = [];
  if (lossHold >= winHold * 2 && lossHold >= winHold + 5) {
    const group = losers.filter((trade) => trade.holdMinutes > winHold);
    if (group.length >= 3) {
      out.push(
        draft("hold-losers", "negative", "Disposition effect", group, {
          mark: "Bias",
          detail: `Holding the red trades longer than the green ones. Losing trades were held about ${fmtHold(lossHold)}. Winning trades were held about ${fmtHold(winHold)}. ${group.length} of the red trades outlasted that winning hold${including(group, true)}.`,
        }),
      );
    }
  }
  if (winHold >= lossHold * 2 && winHold >= lossHold + 5) {
    const group = winners.filter((trade) => trade.holdMinutes > lossHold);
    if (group.length >= 3) {
      out.push(
        draft("hold-winners", "positive", "Let the green trades work", group, {
          detail: `Winning trades were held about ${fmtHold(winHold)}. Losing trades were held about ${fmtHold(lossHold)}. ${group.length} of the green trades outlasted that losing hold${including(group, false)}.`,
        }),
      );
    }
  }
  return out;
}

function sessionHabits(trades: RoundTrip[], bounds?: BookBounds): Draft[] {
  const overnight = trades.filter((trade) => sessionName(trade) === "Overnight");
  const day = trades.filter((trade) => sessionName(trade) !== "Overnight");
  const out: Draft[] = [];
  if (worth("negative", overnight, day)) {
    const rule = bounds?.overnightRule ? `Your rule says “${bounds.overnightRule}”.` : net(day) > 0 ? `The daytime tickets finished ${fmtUsd(net(day))}.` : "";
    out.push(
      draft("overnight", "negative", "The overnight tickets lost", overnight, {
        detail: `${overnight.length} entries landed in the overnight session and dropped ${money(overnight)}${including(overnight, true)}. ${rule}`,
      }),
    );
  }
  if (worth("positive", day, overnight)) {
    out.push(
      draft("daytime", "positive", "The daytime tickets paid", day, {
        detail: `${day.length} entries landed in the morning, midday, or evening and made ${gained(day)}${including(day, false)}.`,
      }),
    );
  }
  return out;
}

/**
 * Averaging down is another buy in the same round trip, at least 10% under the
 * average already held, after the coin had moved against the position. A second
 * buy that is not lower is not averaging down.
 */
function addHabits(trades: RoundTrip[], bounds?: BookBounds): Draft[] {
  const multi = trades.filter((trade) => trade.buys > 1);
  const down = trades.filter((trade) => trade.averagedDown === true);
  const once = trades.filter((trade) => trade.averagedDown !== true);
  const out: Draft[] = [];
  if (worth("negative", down, once)) {
    const rule = bounds?.onePerCoin ? `Your rule is one ticket per coin (“${bounds.onePerCoin}”).` : "";
    out.push(
      draft("adds", "negative", "Averaging down", down, {
        mark: "Bias",
        detail: `Adding to a loser. ${down.length} tickets bought more after the coin was already down. ${rule} Those dropped ${money(down)}${including(down, true)}.`,
      }),
    );
  }
  if (worth("positive", once, multi) && multi.length >= 3) {
    const rule = bounds?.onePerCoin ? `That matches your rule “${bounds.onePerCoin}”.` : "";
    out.push(
      draft("one-ticket", "positive", "One ticket per coin", once, {
        detail: `${once.length} coins were bought once and made ${gained(once)}${including(once, false)}. ${rule}`,
      }),
    );
  }
  return out;
}

function poolHabits(trades: RoundTrip[]): Draft[] {
  const heavy = trades.filter((trade) => trade.liquidityUsd > 0 && trade.amountUsd >= trade.liquidityUsd * 0.02);
  const light = trades.filter((trade) => trade.liquidityUsd > 0 && trade.amountUsd < trade.liquidityUsd * 0.01);
  if (!worth("negative", heavy, light.length >= 3 ? light : others(trades, heavy))) return [];
  return [
    draft("heavy-pool", "negative", "The ticket was large for the pool", heavy, {
      detail: `${heavy.length} tickets were at least 2% of the pool as it stands now. Those dropped ${money(heavy)}${including(heavy, true)}.`,
    }),
  ];
}

/**
 * Sunk cost is more money in a coin that already lost: a later round trip on
 * the same mint after a red close. A later ticket in a different coin is not
 * sunk cost. Adding inside the open position is averaging down, above.
 */
function reentryHabits(trades: RoundTrip[]): Draft[] {
  const ordered = chronological(trades);
  const lost = new Set<string>();
  const again: RoundTrip[] = [];
  for (const trade of ordered) {
    if (lost.has(trade.mint)) again.push(trade);
    if (trade.pnlUsd < 0) lost.add(trade.mint);
  }
  if (again.length < 2 || net(again) >= 0) return [];
  if (again.length < 3 && again.some((trade) => trade.pnlUsd >= 0)) return [];
  return [
    draft("reentry", "negative", "Sunk-cost fallacy", again, {
      mark: "Fallacy",
      detail: `Trying to get back to even. ${again.length} later tickets were the same coin after a red close. Those dropped ${money(again)}${including(again, true)}.`,
    }),
  ];
}

/**
 * Confirmation bias here is following a caller: a tracked wallet bought before
 * this fill, and the entry came after that buy. A caller who bought after the
 * fill means this wallet led. That is not confirmation, and it is not labeled.
 */
function callerHabits(trades: RoundTrip[], bounds?: BookBounds): Draft[] {
  const tagged = trades.filter((trade) => trade.kols.length > 0);
  if (tagged.length < 6) return [];
  const followed = tagged.filter((trade) => trade.kols.some((kol) => kol.timing === "before"));
  const rest = tagged.filter((trade) => !followed.includes(trade));
  const closer = bounds && bounds.ticketUsd > 0 ? `The ticket stays at ${fmtUsdPlain(bounds.ticketUsd)}. ${ticketWhy(bounds)}` : "";
  const out: Draft[] = [];
  if (worth("negative", followed, rest.length >= 3 ? rest : others(tagged, followed))) {
    const names = callerNames(followed, ["before"]);
    const verb = names.includes(" and ") || names.includes(", ") ? "were" : "was";
    out.push(
      draft("confirmation", "negative", "Confirmation bias", followed, {
        mark: "Bias",
        detail: `${names} ${verb} already in, and the entry followed that buy. Those trades dropped ${money(followed)}${including(followed, true)}. ${closer}`,
      }),
    );
  }
  const followedRest = rest.length >= 3 ? rest : others(tagged, followed);
  if (worth("positive", followed, followedRest)) {
    const names = callerNames(followed, ["before"]);
    const verb = names.includes(" and ") || names.includes(", ") ? "were" : "was";
    out.push(
      draft("caller-early", "positive", "The caller was already in", followed, {
        detail: `${names} ${verb} already in before the buy. Those trades made ${gained(followed)}${including(followed, false)}. ${closer}`,
      }),
    );
  }
  return out;
}

function launchHabits(trades: RoundTrip[]): Draft[] {
  const known = trades.filter((trade) => trade.minutesFromLaunch >= 0);
  if (known.length < 6) return [];
  const late = known.filter((trade) => trade.minutesFromLaunch >= 180);
  const early = known.filter((trade) => trade.minutesFromLaunch <= 60);
  const out: Draft[] = [];
  if (worth("negative", late, early.length >= 3 ? early : others(known, late))) {
    out.push(
      draft("launch-late", "negative", "Bought long after the pool opened", late, {
        detail: `${late.length} buys were at least 3 hours after the pool opened. Those dropped ${money(late)}${including(late, true)}.`,
      }),
    );
  }
  if (worth("positive", early, late.length >= 3 ? late : others(known, early))) {
    out.push(
      draft("launch-early", "positive", "Bought while the pool was young", early, {
        detail: `${early.length} buys were inside the first hour of the pool. Those made ${gained(early)}${including(early, false)}.`,
      }),
    );
  }
  return out;
}

function sizeCloser(group: RoundTrip[], bounds?: BookBounds): string {
  if (!bounds || bounds.ticketUsd <= 0) return "";
  const mid = median(group.map((trade) => trade.amountUsd));
  const ticket = fmtUsdPlain(bounds.ticketUsd);
  if (mid > bounds.ticketUsd * 1.05) return `The next ticket stays at ${ticket}. ${ticketWhy(bounds)}`;
  if (bounds.ticketReason !== "winners") return `Those tickets sit inside ${ticket}. ${ticketWhy(bounds)}`;
  return "";
}

function worth(tone: "positive" | "negative", group: RoundTrip[], rest: RoundTrip[], min = 3): boolean {
  if (group.length < min) return false;
  if (tone === "negative") {
    if (net(group) >= 0) return false;
    if (rest.length < 3) return winRate(group) <= 0.4;
    return winRate(group) + 0.12 <= winRate(rest) || net(rest) > 0;
  }
  if (net(group) <= 0) return false;
  if (rest.length < 3) return winRate(group) >= 0.5;
  return winRate(group) >= winRate(rest) + 0.12 || net(rest) < 0;
}

function draft(
  id: string,
  tone: Habit["tone"],
  title: string,
  group: RoundTrip[],
  copy: { detail: string; mark?: HabitMark },
): Draft {
  return {
    id,
    tone,
    mark: copy.mark ?? (tone === "positive" ? "Tendency" : "Repeat"),
    title,
    detail: copy.detail.replace(/\s+/g, " ").trim(),
    stat: `${group.length} ${group.length === 1 ? "trade" : "trades"} · ${fmtRate(winRate(group))} won · ${fmtUsd(net(group))}`,
    tradeIds: group.map((trade) => trade.id),
    impact: Math.abs(net(group)),
  };
}

function athPct(group: RoundTrip[]): string {
  const ratios = group
    .map((trade) => (trade.athMarketCapUsd && trade.athMarketCapUsd > 0 ? trade.entryMarketCapUsd / trade.athMarketCapUsd : 0))
    .filter((ratio) => ratio > 0);
  return `${Math.round(median(ratios) * 100)}%`;
}

function money(group: RoundTrip[]): string {
  return fmtUsdPlain(Math.abs(net(group)));
}

function gained(group: RoundTrip[]): string {
  return fmtUsdPlain(net(group));
}

function including(group: RoundTrip[], worst: boolean): string {
  const names = topSymbols(group, worst, 3);
  if (names.length === 0) return "";
  return `, including ${joinAnd(names)}`;
}

function topSymbols(group: RoundTrip[], worst: boolean, limit: number): string[] {
  const ranked = [...group].sort((left, right) => (worst ? left.pnlUsd - right.pnlUsd : right.pnlUsd - left.pnlUsd));
  const names: string[] = [];
  for (const trade of ranked) {
    if (names.includes(trade.symbol)) continue;
    names.push(trade.symbol);
    if (names.length === limit) break;
  }
  return names;
}

function callerNames(group: RoundTrip[], timings: KolTiming[]): string {
  const allowed = new Set(timings);
  const counts = new Map<string, number>();
  for (const trade of group) {
    for (const kol of trade.kols) {
      if (!allowed.has(kol.timing)) continue;
      const label = kolLabel(kol);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const names = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 2)
    .map(([name]) => name);
  return joinAnd(names) || "A tagged caller";
}

function chronological(trades: RoundTrip[]): RoundTrip[] {
  return [...trades].sort((left, right) => left.entryAt.localeCompare(right.entryAt) || left.id.localeCompare(right.id));
}

function others(trades: RoundTrip[], group: RoundTrip[]): RoundTrip[] {
  const ids = new Set(group.map((trade) => trade.id));
  return trades.filter((trade) => !ids.has(trade.id));
}

function byImpact(left: Draft, right: Draft): number {
  return right.impact - left.impact || left.title.localeCompare(right.title);
}

function strip(habit: Draft): Habit {
  return {
    id: habit.id,
    tone: habit.tone,
    mark: habit.mark,
    title: habit.title,
    detail: habit.detail,
    stat: habit.stat,
    tradeIds: habit.tradeIds,
  };
}

function joinAnd(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
