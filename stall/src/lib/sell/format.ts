// Client-safe money helpers (no server imports): integer cents in, display text out.

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return dollars.format(cents / 100);
}

/** "12.99" style amount with exactly two decimals, no symbol. */
export function plainAmount(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** The server rejects unit prices above this (`createSaleBody`); match it here. */
export const MAX_PRICE_CENTS = 1_000_000;

/**
 * Parses what the owner typed into a price field. Accepts "4", "4.5", "4.50",
 * ".99", "$3.25" and a decimal comma. Returns positive integer cents up to
 * $10,000, or null.
 */
export function parseDollars(text: string): number | null {
  const cleaned = text.replace(/[$\s]/g, "").replace(",", ".");
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match || cleaned === "" || cleaned === ".") return null;
  const whole = Number(match[1] || "0");
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  return cents > 0 && cents <= MAX_PRICE_CENTS ? cents : null;
}
