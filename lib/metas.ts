import type { MetaId } from "@/lib/types";

export const META_LABEL: Record<MetaId, string> = {
  animal: "Animals",
  political: "Politics",
  celebrity: "Celebrity",
  ai: "AI",
  food: "Food",
  culture: "Internet culture",
  country: "Country",
  other: "Unsorted",
};

export const META_ORDER: MetaId[] = [
  "political",
  "celebrity",
  "ai",
  "animal",
  "food",
  "country",
  "culture",
  "other",
];

const KEYWORDS: Record<Exclude<MetaId, "other">, string[]> = {
  political: [
    "trump",
    "biden",
    "maga",
    "kamala",
    "obama",
    "president",
    "vote",
    "senate",
    "potus",
    "congress",
    "democrat",
    "republican",
    "ballot",
    "political",
  ],
  celebrity: [
    "elon",
    "kanye",
    "drake",
    "taylor",
    "messi",
    "ronaldo",
    "mrbeast",
    "celebrity",
    "kardashian",
  ],
  ai: ["ai", "gpt", "agent", "neural", "llm", "claude", "openai", "bot"],
  animal: [
    "dog",
    "cat",
    "frog",
    "pepe",
    "inu",
    "kitty",
    "pup",
    "duck",
    "bear",
    "bull",
    "ape",
    "monkey",
    "penguin",
    "capy",
    "woof",
    "meow",
    "fish",
    "bird",
    "hamster",
    "rabbit",
    "doge",
  ],
  food: ["pizza", "burger", "taco", "sushi", "coffee", "bread", "noodle", "fry", "nugget"],
  country: ["america", "china", "japan", "brazil", "brasil", "india", "korea", "france", "usa"],
  culture: ["wojak", "chad", "npc", "sigma", "brainrot", "skibidi", "meme"],
};

export function classifyMeta(name: string, symbol: string): MetaId[] {
  const text = `${name} ${symbol}`.toLowerCase();
  const hits: MetaId[] = [];
  for (const meta of META_ORDER) {
    if (meta === "other") continue;
    if (KEYWORDS[meta].some((word) => hasWord(text, word))) hits.push(meta);
  }
  return hits.slice(0, 2).length > 0 ? hits.slice(0, 2) : ["other"];
}

export function isMetaId(value: string): value is MetaId {
  return value in META_LABEL;
}

function hasWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}
