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
      return `Zapłacono, ${amount.replace(".", ",")} dolarów. Dziękuję`;
  }
}
