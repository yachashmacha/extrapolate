import type { KolTag, KolTiming } from "@/lib/types";

export interface KolProfile {
  id: string;
  handle: string;
  name: string;
}

/** Public memecoin commentators traders already track. Wallets stay empty until the user tags a fill. */
export const KOL_CATALOG: KolProfile[] = [
  { id: "orangie", handle: "orangie", name: "Orangie" },
  { id: "cented", handle: "cented", name: "Cented" },
  { id: "hennssy", handle: "hennssy", name: "Hennssy" },
  { id: "ansem", handle: "blknoiz06", name: "Ansem" },
  { id: "mitch", handle: "idrawline", name: "Mitch" },
  { id: "pow", handle: "pow", name: "Pow" },
  { id: "rasmr", handle: "rasmr", name: "Rasmr" },
  { id: "joji", handle: "joji", name: "Joji" },
  { id: "deku", handle: "deku", name: "Deku" },
  { id: "lynk", handle: "lynk", name: "Lynk" },
];

export function kolFromSpec(spec: string): KolTag {
  const [rawId, rawTiming] = spec.split(":");
  const id = rawId.trim().replace(/^@/, "");
  const timing = normalizeTiming(rawTiming);
  const known = KOL_CATALOG.find(
    (kol) => kol.id === id.toLowerCase() || kol.handle.toLowerCase() === id.toLowerCase(),
  );
  return {
    id: known?.id ?? id.toLowerCase(),
    handle: known?.handle ?? id,
    name: known?.name ?? id,
    timing,
  };
}

export function makeKol(idOrHandle: string, timing: KolTiming = "before"): KolTag {
  return kolFromSpec(`${idOrHandle}:${timing}`);
}

function normalizeTiming(value: string | undefined): KolTiming {
  if (value === "with" || value === "after" || value === "before") return value;
  return "before";
}
