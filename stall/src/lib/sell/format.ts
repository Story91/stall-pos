// Client-safe money helpers (no server imports): integer cents in, display text out.
import { LOCALES } from "@/lib/i18n/locale";
import type { Language } from "@/lib/parse/schema";

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

/** "maria@stall.example" -> "m••••@stall.example": enough to recognise, not to copy. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "••••";
  return `${email[0]}••••${email.slice(at)}`;
}

/** "3:05 PM" (or "15:05" in Polish) in the business timezone. */
export function clockTime(iso: string, tz?: string, language: Language = "en"): string {
  return new Intl.DateTimeFormat(LOCALES[language], { hour: "numeric", minute: "2-digit", timeZone: tz }).format(
    new Date(iso),
  );
}

/** "2026-11-04" -> "Wednesday, November 4" ("środa, 4 listopada" in Polish). */
export function longDate(date: string, language: Language = "en"): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "2026-11-02" -> "Nov 2" ("2 lis" in Polish). */
export function shortDate(date: string, language: Language = "en"): string {
  return new Intl.DateTimeFormat(LOCALES[language], { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
