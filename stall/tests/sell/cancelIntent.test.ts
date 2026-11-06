import { describe, expect, it } from "vitest";
import { isCancelIntent } from "@/lib/sell/cancelIntent";

describe("isCancelIntent", () => {
  it.each(["cancel that sale", "Cancel the last order", "void it", "cancela la venta", "Anúlala", "anuluj ostatnią sprzedaż", "Anulować"])(
    "hears a cancel in %s",
    (text) => expect(isCancelIntent(text)).toBe(true),
  );
  it.each([
    "two tacos al pastor and an agua fresca",
    "dos tacos de carnitas",
    "cancellation fee taco",
    "",
    "please cancel nothing and give me two tacos al pastor one horchata and chips",
  ])("does not hijack %j", (text) => expect(isCancelIntent(text)).toBe(false));
});
