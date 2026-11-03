import type { ParsedItem } from "@/lib/parse/schema";

/** Below this the model was guessing; the row is flagged for the owner to check. */
export const LOW_CONFIDENCE = 0.6;

export type ItemRow = {
  id: string;
  name: string;
  qty: number;
  /** null until the owner (or the catalog) gives a price; blocks Charge. */
  unitCents: number | null;
  taxable: boolean;
  confidence: number;
  catalogItemId?: string;
};

export type SaleLineInput = {
  name: string;
  qty: number;
  unitCents: number;
  taxable: boolean;
  catalogItemId?: string;
};

let counter = 0;

export function toRows(items: ParsedItem[]): ItemRow[] {
  return items.map((item) => ({
    id: `row-${++counter}`,
    name: item.name,
    qty: item.qty,
    unitCents: item.unitCents,
    taxable: item.taxable,
    confidence: item.confidence,
    ...(item.catalogItemId ? { catalogItemId: item.catalogItemId } : {}),
  }));
}

export function canCharge(rows: ItemRow[]): boolean {
  return rows.length > 0 && rows.every((row) => row.unitCents !== null && row.qty > 0);
}

export function rowsToLines(rows: ItemRow[]): SaleLineInput[] {
  return rows.map((row) => {
    if (row.unitCents === null) throw new Error(`"${row.name}" has no price`);
    return {
      name: row.name,
      qty: row.qty,
      unitCents: row.unitCents,
      taxable: row.taxable,
      ...(row.catalogItemId ? { catalogItemId: row.catalogItemId } : {}),
    };
  });
}
