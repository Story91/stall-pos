export type Line = {
  name: string;
  qty: number;
  unitCents: number;
  taxable: boolean;
};

// Round half up for non-negative values: 0.5 -> 1, 0.4 -> 0.
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

// Parts per million: covers tax rates with up to six decimal places.
const RATE_SCALE = 1_000_000;

/**
 * Tax on one line in integer math: round(cents * rate) = floor((2*cents*ppm + S) / (2*S)),
 * where ppm = rate in parts per million and S = RATE_SCALE. Avoids float
 * multiplication, which lands just below .5 at exact half-cent boundaries.
 */
function lineTaxCents(lineCents: number, rateParts: number): number {
  return Math.floor((2 * lineCents * rateParts + RATE_SCALE) / (2 * RATE_SCALE));
}

/**
 * Sale totals in integer cents, computed the way PayPal Invoicing does: tax is
 * rounded half up per line (qty x unit price), then summed, so the screen and
 * the invoice the customer pays agree to the cent. The tip is a percent of the
 * pre-tax subtotal and is never taxed.
 */
export function computeTotals(
  lines: Line[],
  taxRate: number,
  tipPct: 0 | 15 | 18 | 20 | null,
): {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
} {
  const rateParts = Math.round(taxRate * RATE_SCALE);
  let subtotalCents = 0;
  let taxCents = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || !Number.isInteger(line.unitCents)) {
      throw new RangeError(
        `line "${line.name}" needs integer qty and unitCents, got ${line.qty} and ${line.unitCents}`,
      );
    }
    const lineCents = line.qty * line.unitCents;
    subtotalCents += lineCents;
    if (line.taxable) taxCents += lineTaxCents(lineCents, rateParts);
  }

  const tipCents =
    tipPct === null ? 0 : roundHalfUp((subtotalCents * tipPct) / 100);

  return {
    subtotalCents,
    taxCents,
    tipCents,
    totalCents: subtotalCents + taxCents + tipCents,
  };
}
