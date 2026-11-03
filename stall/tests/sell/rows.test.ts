import { describe, expect, it } from "vitest";
import { canCharge, rowsToLines, toRows, LOW_CONFIDENCE } from "@/lib/sell/rows";
import type { ParsedItem } from "@/lib/parse/schema";

const items: ParsedItem[] = [
  { name: "Taco al pastor", qty: 2, unitCents: 350, confidence: 0.95, taxable: true, catalogItemId: "c1" },
  { name: "Agua fresca", qty: 1, unitCents: null, confidence: 0.4, taxable: false },
];

describe("rows", () => {
  it("turns parsed items into editable rows with unique ids", () => {
    const rows = toRows(items);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Taco al pastor", qty: 2, unitCents: 350, catalogItemId: "c1" });
    expect(rows[0]?.id).not.toBe(rows[1]?.id);
    expect(LOW_CONFIDENCE).toBe(0.6);
  });

  it("cannot charge while a row has no price or the ticket is empty", () => {
    const rows = toRows(items);
    expect(canCharge(rows)).toBe(false);
    expect(canCharge([])).toBe(false);
    expect(canCharge(rows.map((r) => ({ ...r, unitCents: r.unitCents ?? 300 })))).toBe(true);
  });

  it("maps priced rows to API lines, keeping catalogItemId only when present", () => {
    const rows = toRows(items).map((r) => ({ ...r, unitCents: r.unitCents ?? 300 }));
    expect(rowsToLines(rows)).toEqual([
      { name: "Taco al pastor", qty: 2, unitCents: 350, taxable: true, catalogItemId: "c1" },
      { name: "Agua fresca", qty: 1, unitCents: 300, taxable: false },
    ]);
  });
});
