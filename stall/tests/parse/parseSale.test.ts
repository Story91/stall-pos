import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/db/schema";
import { buildSystemPrompt, parseSale } from "@/lib/parse/parseSale";

function catalogItem(overrides: Partial<CatalogItem> & { id: string; name: string }): CatalogItem {
  return {
    businessId: "biz-1",
    aliases: [],
    defaultPriceCents: null,
    taxable: true,
    sightings: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const catalog = [
  catalogItem({ id: "c-taco", name: "Taco al pastor", aliases: ["tacos"], defaultPriceCents: 450 }),
  catalogItem({ id: "c-agua", name: "Agua fresca", defaultPriceCents: 300, taxable: false }),
];

function fakeModel(object: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(object) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

const run = (object: unknown, language: "en" | "es" | "pl" = "en") =>
  parseSale({ transcript: "ignored by the fake", language, catalog }, { model: fakeModel(object) });

describe("parseSale", () => {
  it("converts dollars to integer cents", async () => {
    const sale = await run({
      items: [{ name: "salsa", qty: 1, unitPrice: 4.5, confidence: 0.9 }],
      spokenConfirmation: "One salsa.",
    });
    expect(sale.items[0]?.unitCents).toBe(450);
  });

  it("rounds float-noisy dollar amounts to the nearest cent", async () => {
    const sale = await run({
      items: [{ name: "salsa", qty: 1, unitPrice: 4.35, confidence: 0.9 }],
      spokenConfirmation: "One salsa.",
    });
    expect(sale.items[0]?.unitCents).toBe(435);
  });

  it("defaults a missing or null qty to 1", async () => {
    const sale = await run({
      items: [
        { name: "salsa", unitPrice: 3, confidence: 0.9 },
        { name: "limes", qty: null, unitPrice: 1, confidence: 0.9 },
      ],
      spokenConfirmation: "Salsa and limes.",
    });
    expect(sale.items.map((i) => i.qty)).toEqual([1, 1]);
  });

  it("returns no items and a non-empty confirmation when the model found nothing", async () => {
    const sale = await run({ items: [], spokenConfirmation: "" }, "es");
    expect(sale.items).toHaveLength(0);
    expect(sale.spokenConfirmation.length).toBeGreaterThan(0);
    expect(sale.language).toBe("es");
  });

  it("drops items with a zero or negative price and keeps the rest", async () => {
    const sale = await run({
      items: [
        { name: "free sample", qty: 1, unitPrice: 0, confidence: 0.9 },
        { name: "refund", qty: 1, unitPrice: -2, confidence: 0.9 },
        { name: "salsa", qty: 1, unitPrice: 3, confidence: 0.9 },
      ],
      spokenConfirmation: "Free sample, refund and salsa.",
    });
    expect(sale.items.map((i) => i.name)).toEqual(["salsa"]);
    expect(sale.spokenConfirmation).toContain("salsa");
    expect(sale.spokenConfirmation).not.toMatch(/free sample|refund/i);
  });

  it("drops items with a zero or negative qty", async () => {
    const sale = await run({
      items: [
        { name: "nothing", qty: 0, unitPrice: 3, confidence: 0.9 },
        { name: "minus", qty: -1, unitPrice: 3, confidence: 0.9 },
        { name: "salsa", qty: 2, unitPrice: 3, confidence: 0.9 },
      ],
      spokenConfirmation: "ok",
    });
    expect(sale.items.map((i) => i.name)).toEqual(["salsa"]);
  });

  it("gives a non-empty confirmation when every item was dropped", async () => {
    const sale = await run({
      items: [{ name: "free sample", qty: 1, unitPrice: 0, confidence: 0.9 }],
      spokenConfirmation: "One free sample.",
    });
    expect(sale.items).toHaveLength(0);
    expect(sale.spokenConfirmation.length).toBeGreaterThan(0);
    expect(sale.spokenConfirmation).not.toMatch(/free sample/i);
  });

  it("keeps items with a null price and prices them from the catalog", async () => {
    const sale = await run({
      items: [
        { name: "tacos al pastor", qty: 2, unitPrice: null, confidence: 0.8 },
        { name: "sombrero", qty: 1, unitPrice: null, confidence: 0.5 },
      ],
      spokenConfirmation: "Two tacos al pastor and a sombrero.",
    });
    expect(sale.items).toHaveLength(2);
    expect(sale.items[0]).toMatchObject({ catalogItemId: "c-taco", unitCents: 450, qty: 2, taxable: true });
    expect(sale.items[1]).toMatchObject({ unitCents: null, taxable: true });
    expect(sale.items[1]?.catalogItemId).toBeUndefined();
  });

  it("clamps confidence into 0..1", async () => {
    const sale = await run({
      items: [
        { name: "a", qty: 1, unitPrice: 1, confidence: 7 },
        { name: "b", qty: 1, unitPrice: 1, confidence: -3 },
      ],
      spokenConfirmation: "a and b",
    });
    expect(sale.items.map((i) => i.confidence)).toEqual([1, 0]);
  });

  it("keeps the model's confirmation when nothing was dropped", async () => {
    const sale = await run({
      items: [{ name: "salsa", qty: 1, unitPrice: 3, confidence: 0.9 }],
      spokenConfirmation: "One salsa.",
    });
    expect(sale.spokenConfirmation).toBe("One salsa.");
  });

  it("sends the transcript and a language-aware catalog prompt to the model", async () => {
    const model = fakeModel({ items: [], spokenConfirmation: "" });
    await parseSale({ transcript: "dwa kilo pomidorów po cztery", language: "pl", catalog }, { model });
    const sent = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(sent).toContain("dwa kilo pomidorów po cztery");
    expect(sent).toContain("Polish");
    expect(sent).toContain("Taco al pastor");
  });
});

describe("buildSystemPrompt", () => {
  it("names the language, lists catalog names with prices, and states the guardrails", () => {
    const prompt = buildSystemPrompt("es", catalog);
    expect(prompt).toContain("Spanish");
    expect(prompt).toContain("Taco al pastor");
    expect(prompt).toContain("4.50");
    expect(prompt).toContain("Agua fresca");
    expect(prompt).toMatch(/never invent/i);
    expect(prompt).toMatch(/spoken in words/i);
  });

  it("copes with an empty catalog", () => {
    expect(buildSystemPrompt("en", [])).toMatch(/empty/i);
  });
});
