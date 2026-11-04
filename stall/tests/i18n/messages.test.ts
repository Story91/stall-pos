import { describe, expect, it } from "vitest";
import { MESSAGES, messagesFor } from "@/lib/i18n";
import { onePlural, plPlural, polishForm } from "@/lib/i18n/plural";
import { failureText } from "@/lib/owner/api";
import { LANGUAGES } from "@/lib/parse/schema";
import { clockTime, longDate, shortDate } from "@/lib/sell/format";

type Leaf = { path: string; kind: "string" | "function"; arity: number; value: unknown };

function leaves(node: unknown, prefix = ""): Leaf[] {
  if (typeof node === "string") return [{ path: prefix, kind: "string", arity: 0, value: node }];
  if (typeof node === "function") return [{ path: prefix, kind: "function", arity: node.length, value: node }];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("Polish plural forms", () => {
  it("is one for 1, few for 2-4 (not 12-14), many otherwise", () => {
    const cases: [number, string][] = [
      [0, "many"],
      [1, "one"],
      [2, "few"],
      [3, "few"],
      [4, "few"],
      [5, "many"],
      [11, "many"],
      [12, "many"],
      [13, "many"],
      [14, "many"],
      [21, "many"],
      [22, "few"],
      [24, "few"],
      [25, "many"],
      [101, "many"],
      [112, "many"],
      [122, "few"],
    ];
    for (const [n, form] of cases) expect(polishForm(n), String(n)).toBe(form);
  });

  it("picks the word: 1 pozycja, 2 pozycje, 5 pozycji", () => {
    const word = (n: number) => `${n} ${plPlural(n, "pozycja", "pozycje", "pozycji")}`;
    expect([1, 2, 4, 5, 12, 22].map(word)).toEqual([
      "1 pozycja",
      "2 pozycje",
      "4 pozycje",
      "5 pozycji",
      "12 pozycji",
      "22 pozycje",
    ]);
  });

  it("English and Spanish are singular only for exactly 1", () => {
    expect([0, 1, 2].map((n) => onePlural(n, "sale", "sales"))).toEqual(["sales", "sale", "sales"]);
  });
});

describe("message tables", () => {
  const english = leaves(MESSAGES.en);

  it("every language has exactly the English keys, with the same kind of value", () => {
    for (const language of LANGUAGES) {
      const other = leaves(MESSAGES[language]);
      expect(other.map((l) => l.path), language).toEqual(english.map((l) => l.path));
      for (const [i, leaf] of other.entries()) {
        expect(`${language}:${leaf.path}:${leaf.kind}:${leaf.arity}`).toBe(
          `${language}:${english[i]!.path}:${english[i]!.kind}:${english[i]!.arity}`,
        );
      }
    }
  });

  it("no message is empty, and functions return text that includes their values", () => {
    for (const language of LANGUAGES) {
      for (const leaf of leaves(MESSAGES[language])) {
        if (leaf.kind === "string") {
          expect((leaf.value as string).trim(), `${language}:${leaf.path}`).not.toBe("");
          continue;
        }
        const args = Array.from({ length: leaf.arity }, (_, i) => (i === 0 ? 7 : `V${i}`));
        const text = (leaf.value as (...a: unknown[]) => string)(...args);
        expect(text.trim(), `${language}:${leaf.path}`).not.toBe("");
      }
    }
  });

  it("Spanish and Polish are actually translated, not copies of English", () => {
    const strings = english.filter((l) => l.kind === "string");
    for (const language of ["es", "pl"] as const) {
      const other = leaves(MESSAGES[language]).filter((l) => l.kind === "string");
      const same = other.filter((l, i) => l.value === strings[i]!.value).map((l) => l.path);
      // Brand words and a few shared ones ("PayPal", "ok", "Total") may match; nothing more.
      expect(same.length / strings.length, `${language}: ${same.join(", ")}`).toBeLessThan(0.06);
    }
  });

  it("uses proper plurals in the counted messages", () => {
    const pl = messagesFor("pl");
    expect([1, 2, 5].map(pl.pin.digits)).toEqual(["Wpisano 1 cyfrę", "Wpisano 2 cyfry", "Wpisano 5 cyfr"]);
    expect([1, 3, 5].map(pl.day.decisionsWait)).toEqual([
      "1 decyzja czeka na ciebie.",
      "3 decyzje czekają na ciebie.",
      "5 decyzji czeka na ciebie.",
    ]);
    expect([1, 2, 5].map(pl.totals.tookIn)).toEqual([
      "Utarg: 1 sprzedaż",
      "Utarg: 2 sprzedaże",
      "Utarg: 5 sprzedaży",
    ]);
    expect([1, 2].map(messagesFor("en").day.decisionsWait)).toEqual([
      "1 decision waits for you.",
      "2 decisions wait for you.",
    ]);
    expect([1, 2].map(messagesFor("es").totals.tookIn)).toEqual(["Ingresos de 1 venta", "Ingresos de 2 ventas"]);
    expect(messagesFor("en").day.allSettled(1)).toBe("Today's decision is settled.");
  });
});

describe("failureText in the owner's language", () => {
  it("defaults to English and follows the language when given", () => {
    const failure = { status: 409, code: "amount_changed" };
    expect(failureText(failure)).toBe(MESSAGES.en.errors.amountChanged);
    expect(failureText(failure, "pl")).toBe(MESSAGES.pl.errors.amountChanged);
    expect(failureText({ status: 0, code: "network" }, "es")).toBe(
      "Sin conexión. Revisa tu señal e intenta otra vez.",
    );
    expect(failureText({ status: 500, code: "server" }, "pl")).toBe(MESSAGES.pl.common.serverError);
  });
});

describe("dates and times in the owner's language", () => {
  it("formats in English by default, Spanish and Polish on request", () => {
    expect(longDate("2026-11-04", "es")).toBe("miércoles, 4 de noviembre");
    expect(longDate("2026-11-04", "pl")).toBe("środa, 4 listopada");
    expect(clockTime("2026-11-04T21:05:00Z", "America/Chicago", "pl")).toBe("15:05");
    expect(shortDate("2026-11-02")).toBe("Nov 2");
  });
});
