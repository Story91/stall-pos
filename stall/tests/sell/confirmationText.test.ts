import { describe, expect, it } from "vitest";
import { confirmationText } from "@/lib/sell/confirmationText";

describe("confirmationText", () => {
  it("speaks the total in English", () => {
    expect(confirmationText("en", 1840)).toBe("Paid, $18.40. Thank you");
  });

  it("speaks the total in Spanish", () => {
    expect(confirmationText("es", 1840)).toBe("Pagado, 18.40 dólares. Gracias");
  });

  it("speaks the total in Polish with a decimal comma", () => {
    expect(confirmationText("pl", 1840)).toBe("Zapłacono, 18,40 dolara. Dziękuję");
    expect(confirmationText("pl", 200)).toMatch(/ dolary. /);
    expect(confirmationText("pl", 500)).toMatch(/ dolarów. /);
    expect(confirmationText("pl", 1200)).toMatch(/ dolarów. /);
    expect(confirmationText("pl", 2200)).toMatch(/ dolary. /);
  });

  it("keeps cents padded", () => {
    expect(confirmationText("en", 1205)).toBe("Paid, $12.05. Thank you");
  });
});
