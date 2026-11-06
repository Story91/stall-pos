import type { Language } from "@/lib/parse/schema";
import { plainAmount } from "@/lib/sell/format";

/** What the phone says out loud once a sale is paid, in the sale's language. */
export function confirmationText(language: Language, cents: number): string {
  const amount = plainAmount(cents);
  switch (language) {
    case "en":
      return `Paid, $${amount}. Thank you`;
    case "es":
      return `Pagado, ${amount} dólares. Gracias`;
    case "pl":
      // Polish reads a decimal comma naturally; a dot is spoken as "kropka".
      return `Zapłacono, ${amount.replace(".", ",")} ${polishDollars(cents)}. Dziękuję`;
  }
}

/** "12,99 dolara", "1 dolar", "2 dolary", "5 dolarów": a fraction always takes "dolara". */
function polishDollars(cents: number): string {
  if (cents % 100 !== 0) return "dolara";
  const n = cents / 100;
  if (n === 1) return "dolar";
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "dolary" : "dolarów";
}
