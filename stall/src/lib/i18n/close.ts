// Server-side wording for the close of day: the summary sentences and the
// rules engine's reasons. Code still builds every sentence from facts; only the
// words change with the owner's language. Amounts arrive already formatted ("$120.00").
import type { Language } from "@/lib/parse/schema";
import { onePlural, plPlural } from "./plural";

/**
 * "2026-11-04" as the owner would say it: "November 4", "4 de noviembre", "4 listopada".
 * The summary is read aloud, and a speech voice reads an ISO date digit by digit.
 */
function sayDate(iso: string, locale: string): string {
  const day = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(day);
}

type Kind = "shift" | "bill";

export type CloseMessages = {
  /** The language's name in English, for the agent's system prompt. */
  languageName: string;
  summary: {
    closed(date: string): string;
    paid(count: number, total: string, names: string): string;
    needDecision(count: number, names: string): string;
    failed(count: number, names: string): string;
    skipped(count: number): string;
    nothing: string;
  };
  reasons: {
    alreadyEscalated: string;
    payoutExists(kind: Kind, status: string): string;
    previousPayout(status: string): string;
    noDailyRate(name: string): string;
    invalidAmount(cents: number, name: string): string;
    duplicate(amount: string, name: string, date: string): string;
    disabled(name: string): string;
    notAutoPay(name: string): string;
    overPayeeLimit(amount: string, name: string, remaining: string, limit: string): string;
    overBusinessCap(amount: string, cap: string): string;
    shiftOk(amount: string, name: string): string;
    billOk(amount: string, name: string): string;
  };
  /** Stored as the payout rationale when the owner approves a held item. */
  approvedByOwner: string;
};

const en: CloseMessages = {
  languageName: "English",
  summary: {
    closed: (date) => `Closed ${sayDate(date, "en-US")}.`,
    paid: (count, total, names) => `Paid ${count} (${total} total): ${names}.`,
    needDecision: (count, names) => `${count} ${onePlural(count, "needs", "need")} your decision: ${names}.`,
    failed: (count, names) => `${count} could not be paid and will be retried: ${names}.`,
    skipped: (count) => `${count} already handled.`,
    nothing: "Nothing to pay today.",
  },
  reasons: {
    alreadyEscalated: "Already escalated to the owner; waiting for their decision.",
    payoutExists: (kind, status) =>
      `A payout for this ${kind} already exists with status ${status}, so it will not be paid again.`,
    previousPayout: (status) => `previous payout ${status}; check before paying again`,
    noDailyRate: (name) =>
      `${name} has no daily rate set; add one in Settings before this shift can be paid.`,
    invalidAmount: (cents, name) => `Held for review: invalid amount (${cents} cents) for ${name}.`,
    duplicate: (amount, name, date) =>
      `Possible duplicate: a ${amount} bill for ${name} was already paid on ${sayDate(date, "en-US")}.`,
    disabled: (name) => `${name} is disabled, so this payment needs your approval.`,
    notAutoPay: (name) => `${name} is not on auto-pay, so this payment needs your approval.`,
    overPayeeLimit: (amount, name, remaining, limit) =>
      `${amount} would exceed ${name}'s remaining daily allowance of ${remaining} (daily limit ${limit}).`,
    overBusinessCap: (amount, cap) =>
      `${amount} would take today's total past the ${cap} business daily cap.`,
    shiftOk: (amount, name) => `Shift logged today; ${amount} within ${name}'s daily limit.`,
    billOk: (amount, name) =>
      `Bill of ${amount} for ${name} is within the daily limit and auto-pay is on.`,
  },
  approvedByOwner: "Approved by owner",
};

const es: CloseMessages = {
  languageName: "Spanish (informal, as spoken by Mexican-American street vendors)",
  summary: {
    closed: (date) => `Cierre del ${sayDate(date, "es-US")}.`,
    paid: (count, total, names) =>
      `${onePlural(count, "Se pagó", "Se pagaron")} ${count} (total ${total}): ${names}.`,
    needDecision: (count, names) =>
      `${count} ${onePlural(count, "espera", "esperan")} tu decisión: ${names}.`,
    failed: (count, names) =>
      `${count} no se ${onePlural(count, "pudo", "pudieron")} pagar y se ${onePlural(count, "volverá", "volverán")} a intentar: ${names}.`,
    skipped: (count) => `${count} ya ${onePlural(count, "estaba resuelto", "estaban resueltos")}.`,
    nothing: "Hoy no hay nada que pagar.",
  },
  reasons: {
    alreadyEscalated: "Ya se le pasó al dueño; espera su decisión.",
    payoutExists: (kind, status) =>
      `Ya existe un pago para ${kind === "shift" ? "este turno" : "esta cuenta"} con estado ${status}, así que no se pagará otra vez.`,
    previousPayout: (status) => `el pago anterior quedó ${status}; revisa antes de pagar otra vez`,
    noDailyRate: (name) =>
      `${name} no tiene pago diario; agrégalo en Ajustes para poder pagar este turno.`,
    invalidAmount: (cents, name) =>
      `Apartado para revisar: monto inválido (${cents} centavos) para ${name}.`,
    duplicate: (amount, name, date) =>
      `Posible duplicado: ya se pagó una cuenta de ${amount} a ${name} el ${sayDate(date, "es-US")}.`,
    disabled: (name) => `${name} está en pausa, así que este pago necesita tu aprobación.`,
    notAutoPay: (name) => `${name} no tiene pago automático, así que este pago necesita tu aprobación.`,
    overPayeeLimit: (amount, name, remaining, limit) =>
      `${amount} pasa lo que le queda hoy a ${name}, que es ${remaining} (límite diario ${limit}).`,
    overBusinessCap: (amount, cap) =>
      `${amount} pasaría el total de hoy por encima del límite diario del negocio de ${cap}.`,
    shiftOk: (amount, name) => `Turno anotado hoy; ${amount} dentro del límite diario de ${name}.`,
    billOk: (amount, name) =>
      `La cuenta de ${amount} de ${name} está dentro del límite diario y el pago automático está activo.`,
  },
  approvedByOwner: "Aprobado por el dueño",
};

const item = (count: number) => plPlural(count, "pozycja", "pozycje", "pozycji");

const pl: CloseMessages = {
  languageName: "Polish",
  summary: {
    closed: (date) => `Zamknięto dzień ${sayDate(date, "pl-PL")}.`,
    paid: (count, total, names) =>
      `Wypłacono ${count} ${plPlural(count, "pozycję", "pozycje", "pozycji")} (razem ${total}): ${names}.`,
    needDecision: (count, names) =>
      `${count} ${item(count)} ${plPlural(count, "czeka", "czekają", "czeka")} na twoją decyzję: ${names}.`,
    failed: (count, names) =>
      `${count} ${item(count)} do ponownej próby, bo wypłata się nie udała: ${names}.`,
    skipped: (count) =>
      `${count} ${item(count)} ${plPlural(count, "była już załatwiona", "były już załatwione", "było już załatwionych")}.`,
    nothing: "Dziś nie ma nic do wypłacenia.",
  },
  reasons: {
    alreadyEscalated: "Już przekazano właścicielowi; czeka na jego decyzję.",
    payoutExists: (kind, status) =>
      `Wypłata za ${kind === "shift" ? "tę zmianę" : "ten rachunek"} już istnieje (status ${status}), więc nie zostanie powtórzona.`,
    previousPayout: (status) => `poprzednia wypłata: ${status}; sprawdź przed ponowną wypłatą`,
    noDailyRate: (name) =>
      `Odbiorca ${name} nie ma stawki dziennej; dodaj ją w Ustawieniach, zanim ta zmiana zostanie wypłacona.`,
    invalidAmount: (cents, name) =>
      `Wstrzymano do sprawdzenia: nieprawidłowa kwota (${cents} ${plPlural(cents, "cent", "centy", "centów")}), odbiorca ${name}.`,
    duplicate: (amount, name, date) =>
      `Możliwy duplikat: rachunek na ${amount} (${name}) został już zapłacony ${sayDate(date, "pl-PL")}.`,
    disabled: (name) => `Odbiorca ${name} jest wyłączony, więc ta płatność wymaga twojej zgody.`,
    notAutoPay: (name) =>
      `Odbiorca ${name} nie ma autopłatności, więc ta płatność wymaga twojej zgody.`,
    overPayeeLimit: (amount, name, remaining, limit) =>
      `${amount} przekracza to, co zostało z dziennego limitu odbiorcy ${name}: ${remaining} (limit dzienny ${limit}).`,
    overBusinessCap: (amount, cap) =>
      `${amount} przekroczyłoby dzisiejszy limit firmy wynoszący ${cap}.`,
    shiftOk: (amount, name) =>
      `Zmiana zapisana dziś; ${amount} mieści się w dziennym limicie odbiorcy ${name}.`,
    billOk: (amount, name) =>
      `Rachunek na ${amount} (${name}) mieści się w dziennym limicie, a autopłatność jest włączona.`,
  },
  approvedByOwner: "Zatwierdzone przez właściciela",
};

const CLOSE_MESSAGES: Record<Language, CloseMessages> = { en, es, pl };

export function closeMessages(language: Language = "en"): CloseMessages {
  return CLOSE_MESSAGES[language];
}
