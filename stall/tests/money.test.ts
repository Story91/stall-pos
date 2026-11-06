import { describe, expect, it } from "vitest";
import { computeTotals, type Line } from "@/lib/money";

const tacoLines: Line[] = [
  { name: "Taco al pastor", qty: 2, unitCents: 450, taxable: true },
  { name: "Agua fresca", qty: 1, unitCents: 300, taxable: true },
];

describe("computeTotals", () => {
  it("matches the spec example with no tip", () => {
    expect(computeTotals(tacoLines, 0.0825, null)).toEqual({
      subtotalCents: 1200,
      taxCents: 99,
      tipCents: 0,
      totalCents: 1299,
    });
  });

  it("rounds tax per line and sums, like PayPal Invoicing", () => {
    // 300 * 0.0825 = 24.75 -> 25; 300 -> 25; 200 * 0.0825 = 16.5 -> 17. Sum 67,
    // where tax on the 800 subtotal at once would be 66.
    const drinks: Line[] = [
      { name: "Agua fresca", qty: 1, unitCents: 300, taxable: true },
      { name: "Mexican Coke", qty: 1, unitCents: 300, taxable: true },
      { name: "Bottled water", qty: 1, unitCents: 200, taxable: true },
    ];
    expect(computeTotals(drinks, 0.0825, null)).toEqual({
      subtotalCents: 800,
      taxCents: 67,
      tipCents: 0,
      totalCents: 867,
    });
  });

  it("taxes a line on qty x unit price, not per unit", () => {
    // 3 x 300 = 900 * 0.0825 = 74.25 -> 74; per unit would give 3 x 25 = 75.
    const lines: Line[] = [{ name: "Agua fresca", qty: 3, unitCents: 300, taxable: true }];
    expect(computeTotals(lines, 0.0825, null).taxCents).toBe(74);
  });

  it("tips on the pre-tax subtotal, with tax still per line", () => {
    const drinks: Line[] = [
      { name: "Agua fresca", qty: 1, unitCents: 300, taxable: true },
      { name: "Mexican Coke", qty: 1, unitCents: 300, taxable: true },
      { name: "Bottled water", qty: 1, unitCents: 200, taxable: true },
    ];
    // tip 800 * 15 / 100 = 120
    expect(computeTotals(drinks, 0.0825, 15)).toEqual({
      subtotalCents: 800,
      taxCents: 67,
      tipCents: 120,
      totalCents: 987,
    });
  });

  it("excludes non-taxable lines from tax", () => {
    const lines: Line[] = [
      { name: "Taco al pastor", qty: 2, unitCents: 450, taxable: true },
      { name: "Bottled water", qty: 1, unitCents: 300, taxable: false },
    ];
    // taxable 900 * 0.0825 = 74.25 -> 74
    expect(computeTotals(lines, 0.0825, null)).toEqual({
      subtotalCents: 1200,
      taxCents: 74,
      tipCents: 0,
      totalCents: 1274,
    });
  });

  it("computes an 18% tip on the pre-tax subtotal", () => {
    // tip 1200 * 18 / 100 = 216; tax 99; total 1200 + 99 + 216
    expect(computeTotals(tacoLines, 0.0825, 18)).toEqual({
      subtotalCents: 1200,
      taxCents: 99,
      tipCents: 216,
      totalCents: 1515,
    });
  });

  it("rounds exact half cents up on tax", () => {
    // taxable 50 * 0.01 = 0.5 cents -> 1 cent
    const lines: Line[] = [{ name: "Gum", qty: 1, unitCents: 50, taxable: true }];
    expect(computeTotals(lines, 0.01, null)).toEqual({
      subtotalCents: 50,
      taxCents: 1,
      tipCents: 0,
      totalCents: 51,
    });
  });

  it("rounds exact half cents up on tip", () => {
    // tip 50 * 15 / 100 = 7.5 cents -> 8 cents
    const lines: Line[] = [{ name: "Gum", qty: 1, unitCents: 50, taxable: false }];
    expect(computeTotals(lines, 0, 15)).toEqual({
      subtotalCents: 50,
      taxCents: 0,
      tipCents: 8,
      totalCents: 58,
    });
  });

  it("rounds half-cent tax up where float multiplication lands just below .5", () => {
    // 360 * 0.0875 = 31.5 exactly; float multiply gives 31.499999999999996
    const burrito: Line[] = [
      { name: "Burrito", qty: 1, unitCents: 360, taxable: true },
    ];
    expect(computeTotals(burrito, 0.0875, null).taxCents).toBe(32);

    // 1400 * 0.0875 = 122.5 -> 123
    const combo: Line[] = [
      { name: "Combo", qty: 1, unitCents: 1400, taxable: true },
    ];
    expect(computeTotals(combo, 0.0875, null).taxCents).toBe(123);

    // 111000 * 0.0735 = 8158.5 -> 8159
    const catering: Line[] = [
      { name: "Catering", qty: 1, unitCents: 111000, taxable: true },
    ];
    expect(computeTotals(catering, 0.0735, null).taxCents).toBe(8159);
  });

  it("rejects non-integer quantities and unit prices", () => {
    expect(() =>
      computeTotals([{ name: "Taco", qty: 1.5, unitCents: 450, taxable: true }], 0.0825, null),
    ).toThrow(RangeError);
    expect(() =>
      computeTotals([{ name: "Taco", qty: 1, unitCents: 449.5, taxable: true }], 0.0825, null),
    ).toThrow(RangeError);
  });

  it("returns all zeros for no lines", () => {
    expect(computeTotals([], 0.0825, 20)).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 0,
    });
  });
});
