// Plural forms, written by hand so the rules are explicit and testable.
// English and Spanish: one / other. Polish: one (1), few (2-4, 22-24, ... but
// not 12-14), many (0, 5-21, 25-31, ...).

export type PolishForm = "one" | "few" | "many";

export function polishForm(n: number): PolishForm {
  const abs = Math.abs(n);
  if (abs === 1) return "one";
  const lastDigit = abs % 10;
  const lastTwo = abs % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "few";
  return "many";
}

/** Polish word for `n` things: plPlural(2, "pozycja", "pozycje", "pozycji") -> "pozycje". */
export function plPlural(n: number, one: string, few: string, many: string): string {
  const form = polishForm(n);
  return form === "one" ? one : form === "few" ? few : many;
}

/** English or Spanish word for `n` things: only exactly 1 is singular. */
export function onePlural(n: number, one: string, other: string): string {
  return Math.abs(n) === 1 ? one : other;
}
