import type { CatalogItem } from "@/db/schema";
import type { ParsedItem } from "./schema";

export type UnmatchedItem = Omit<ParsedItem, "catalogItemId" | "taxable">;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip a plural suffix from every word: "tacos al pastor" -> "taco al pastor". */
function singularize(phrase: string, suffix: "s" | "es"): string {
  return phrase
    .split(" ")
    .map((word) => (word.length > suffix.length + 2 && word.endsWith(suffix) ? word.slice(0, -suffix.length) : word))
    .join(" ");
}

function keysFor(text: string): string[] {
  const phrase = normalize(text);
  return [phrase, singularize(phrase, "s"), singularize(phrase, "es")];
}

/**
 * Fill `catalogItemId`, `taxable` and (when the vendor gave no price) `unitCents`
 * from the catalog. Matching is case-, accent- and simple-plural-insensitive on
 * the item name and its aliases. A spoken price always wins over the default.
 */
export function matchCatalog(items: UnmatchedItem[], catalog: CatalogItem[]): ParsedItem[] {
  const index = new Map<string, CatalogItem>();
  for (const entry of catalog) {
    for (const label of [entry.name, ...entry.aliases]) {
      for (const key of keysFor(label)) {
        if (!index.has(key)) index.set(key, entry);
      }
    }
  }

  return items.map((item) => {
    const match = keysFor(item.name)
      .map((key) => index.get(key))
      .find((entry) => entry !== undefined);
    if (!match) return { ...item, taxable: true };
    return {
      ...item,
      unitCents: item.unitCents ?? match.defaultPriceCents,
      catalogItemId: match.id,
      taxable: match.taxable,
    };
  });
}
