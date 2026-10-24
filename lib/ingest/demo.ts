import { kolFromSpec } from "@/lib/kols";
import type { Book, MetaId, RoundTrip, TerminalId } from "@/lib/types";

/**
 * A full month of invented fills. The coins are not real.
 * The shape is: a real edge at small size and small market cap,
 * given back on oversized chases, mostly overnight.
 */
export function sampleBook(terminal: TerminalId = "axiom"): Book {
  const trades = ROWS.map((row) => toTrade(row, terminal));
  return {
    source: "sample",
    terminal,
    label: "Sample book",
    trades,
    opens: [
      {
        mint: "sample:open-milo",
        symbol: "MILO",
        name: "Milo",
        tokens: 1_400_000,
        costUsd: 160,
        entryAt: at("10-23", 11, 20),
        entryMarketCapUsd: 36_000,
        metas: ["animal"],
      },
    ],
    warnings: [],
    fetchedAt: at("10-23", 12, 0),
  };
}

type Row = [
  md: string,
  hm: string,
  hold: number,
  symbol: string,
  name: string,
  meta: MetaId,
  mc: number,
  amount: number,
  pct: number,
  kols: string,
  liq: number,
  launch: number,
];

const ROWS: Row[] = [
  ["10-01", "10:12", 22, "BONKO", "The Bonko", "animal", 28_000, 150, 64, "orangie:before|cented:before", 52_000, 40],
  ["10-01", "13:40", 18, "MISO", "Miso Cat", "animal", 41_000, 180, 27, "orangie:before", 61_000, 55],
  ["10-01", "23:50", 4, "BILL", "Bill Coin", "political", 380_000, 480, -58, "", 22_000, 520],
  ["10-02", "00:35", 3, "VOTE", "Vote Coin", "political", 640_000, 860, -53, "ansem:after", 19_000, 600],
  ["10-02", "11:05", 28, "PLIP", "Plip Duck", "animal", 24_000, 140, 79, "hennssy:before|orangie:before", 47_000, 25],
  ["10-02", "15:20", 14, "GARY", "Gary", "animal", 56_000, 200, 23, "cented:before", 70_000, 70],
  ["10-03", "10:45", 11, "ZOOP", "Zoop", "animal", 33_000, 160, -9, "orangie:before", 44_000, 48],
  ["10-03", "11:15", 20, "NEURA", "Neura", "ai", 34_000, 150, 74, "orangie:before", 48_000, 28],
  ["10-03", "14:10", 34, "HONK", "Honk", "animal", 19_000, 120, 78, "orangie:with", 38_000, 18],
  ["10-04", "01:10", 6, "SENATE", "Senate", "political", 510_000, 700, -51, "", 24_000, 800],
  ["10-04", "01:48", 2, "WHIP", "The Whip", "political", 720_000, 1100, -44, "ansem:after", 16_000, 900],
  ["10-05", "11:30", 21, "DUCKY", "Ducky", "animal", 47_000, 190, 51, "cented:before|hennssy:before", 66_000, 60],
  ["10-05", "16:05", 9, "PEBL", "Pebl", "animal", 62_000, 170, -6, "orangie:before", 58_000, 80],
  ["10-05", "21:10", 5, "STAGE", "Stage Name", "celebrity", 220_000, 450, -60, "", 26_000, 200],
  ["10-06", "15:40", 22, "LOOM", "Loom Agent", "ai", 48_000, 170, 38, "cented:before", 60_000, 45],
  ["10-07", "10:20", 26, "NIB", "Nib Cat", "animal", 26_000, 150, 85, "orangie:before", 49_000, 33],
  ["10-07", "11:20", 18, "CAUCUS", "Caucus", "political", 38_000, 140, 58, "orangie:before", 46_000, 22],
  ["10-08", "02:05", 3, "FLAG", "Flag Coin", "political", 880_000, 950, -52, "", 15_000, 1200],
  ["10-08", "12:15", 17, "MAPLE", "Maple Pup", "animal", 38_000, 155, 45, "cented:before", 50_000, 42],
  ["10-09", "10:30", 16, "FLOOR", "The Floor", "political", 51_000, 160, 41, "cented:before", 55_000, 40],
  ["10-09", "11:50", 24, "KIWI", "Kiwi Slice", "food", 44_000, 140, 63, "orangie:before", 48_000, 50],
  ["10-10", "10:55", 13, "KERNEL", "Kernel", "ai", 27_000, 140, -11, "hennssy:with", 44_000, 36],
  ["10-10", "13:25", 15, "BUN", "Bun Noodle", "food", 52_000, 130, 23, "hennssy:with", 45_000, 66],
  ["10-11", "00:25", 5, "PODIUM", "Podium", "political", 460_000, 640, -56, "joji:after", 21_000, 700],
  ["10-11", "00:55", 4, "BALLOT", "Ballot", "political", 540_000, 980, -41, "", 18_000, 740],
  ["10-12", "01:20", 4, "SYNTH", "Synth", "ai", 520_000, 800, -61, "", 17_000, 900],
  ["10-12", "12:20", 10, "SIG", "Sig Coin", "culture", 70_000, 150, -29, "", 28_000, 100],
  ["10-12", "23:40", 6, "CAMEO", "Cameo", "celebrity", 150_000, 380, -55, "joji:after", 24_000, 180],
  ["10-13", "10:40", 12, "PINE", "Pine Tart", "food", 30_000, 125, -10, "cented:before", 40_000, 38],
  ["10-13", "15:05", 31, "LAMP", "Lamp Cat", "animal", 45_000, 210, 96, "orangie:before|cented:before", 73_000, 28],
  ["10-14", "02:45", 8, "MODEL", "The Model", "ai", 410_000, 540, -57, "ansem:after", 19_000, 650],
  ["10-15", "11:00", 18, "CHADLET", "Chadlet", "culture", 40_000, 120, 40, "orangie:before", 36_000, 50],
  ["10-15", "14:10", 7, "ROAR", "Roar", "animal", 480_000, 520, -48, "", 35_000, 300],
  ["10-16", "12:00", 19, "TOASTY", "Toasty", "food", 36_000, 145, 52, "hennssy:before", 43_000, 44],
  ["10-16", "23:30", 3, "HOWL", "Howl", "animal", 360_000, 600, -62, "ansem:after", 20_000, 400],
  ["10-17", "11:05", 15, "GAVEL", "Gavel", "political", 29_000, 130, -14, "hennssy:before", 42_000, 35],
  ["10-17", "13:10", 2, "CRUMB", "Crumb", "food", 22_000, 100, -36, "", 15_000, 15],
  ["10-18", "00:15", 3, "VECTOR", "Vector", "ai", 690_000, 1000, -49, "", 14_000, 1100],
  ["10-18", "14:45", 8, "MUFFIN", "Muffin", "food", 33_000, 110, -9, "hennssy:before", 32_000, 40],
  ["10-19", "16:30", 40, "VELVET", "Velvet", "celebrity", 80_000, 200, -22, "", 30_000, 120],
  ["10-19", "18:05", 25, "ENCORE", "Encore", "celebrity", 95_000, 180, 17, "cented:before", 40_000, 90],
  ["10-20", "11:40", 27, "SABLE", "Sable Pup", "animal", 31_000, 165, 58, "orangie:before|hennssy:before", 51_000, 30],
  ["10-20", "15:10", 20, "QUORUM", "Quorum", "political", 44_000, 150, 33, "orangie:before", 47_000, 32],
  ["10-21", "10:25", 23, "TOKEN", "Token Agent", "ai", 42_000, 155, 36, "cented:before", 53_000, 41],
];

function toTrade(row: Row, terminal: TerminalId): RoundTrip {
  const [md, hm, hold, symbol, name, meta, mc, amount, pct, kols, liq, launch] = row;
  const [hour, minute] = hm.split(":").map(Number);
  const entryAt = at(md, hour, minute);
  const pnlUsd = Math.round(amount * pct) / 100;
  return {
    id: `${symbol.toLowerCase()}-${md.replace("-", "")}`,
    mint: `sample:${symbol.toLowerCase()}`,
    symbol,
    name,
    metas: [meta],
    terminal,
    entryAt,
    exitAt: new Date(new Date(entryAt).getTime() + hold * 60_000).toISOString(),
    entryMarketCapUsd: mc,
    exitMarketCapUsd: Math.round(mc * (1 + pct / 100)),
    liquidityUsd: liq,
    amountUsd: amount,
    pnlUsd,
    pnlPct: pct,
    holdMinutes: hold,
    kols: kols ? kols.split("|").map((spec) => kolFromSpec(spec)) : [],
    minutesFromLaunch: launch,
    buys: 1,
    sells: 1,
  };
}

function at(md: string, hour: number, minute: number): string {
  const [month, day] = md.split("-").map(Number);
  return new Date(Date.UTC(2026, month - 1, day, hour + 4, minute)).toISOString();
}
