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
  let subtotalCents = 0;
  let taxableSubtotalCents = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || !Number.isInteger(line.unitCents)) {
      throw new RangeError(
        `line "${line.name}" needs integer qty and unitCents, got ${line.qty} and ${line.unitCents}`,
      );
    }
    const lineCents = line.qty * line.unitCents;
    subtotalCents += lineCents;
    if (line.taxable) {
      taxableSubtotalCents += lineCents;
    }
  }

  // Tax in integer math: round(taxable * rate) = floor((2*taxable*bp + S) / (2*S))
  // where bp = rate in parts per million and S = RATE_SCALE. Avoids float
  // multiplication, which lands just below .5 at exact half-cent boundaries.
  const rateParts = Math.round(taxRate * RATE_SCALE);
  const taxCents = Math.floor(
    (2 * taxableSubtotalCents * rateParts + RATE_SCALE) / (2 * RATE_SCALE),
  );
  const tipCents =
    tipPct === null ? 0 : roundHalfUp((subtotalCents * tipPct) / 100);

  return {
    subtotalCents,
    taxCents,
    tipCents,
    totalCents: subtotalCents + taxCents + tipCents,
  };
}
