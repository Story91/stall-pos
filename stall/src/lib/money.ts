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
    const lineCents = line.qty * line.unitCents;
    subtotalCents += lineCents;
    if (line.taxable) {
      taxableSubtotalCents += lineCents;
    }
  }

  const taxCents = roundHalfUp(taxableSubtotalCents * taxRate);
  const tipCents =
    tipPct === null ? 0 : roundHalfUp((subtotalCents * tipPct) / 100);

  return {
    subtotalCents,
    taxCents,
    tipCents,
    totalCents: subtotalCents + taxCents + tipCents,
  };
}
