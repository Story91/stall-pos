import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/db/schema";
import { matchCatalog } from "@/lib/parse/matchCatalog";

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

const catalog: CatalogItem[] = [
  catalogItem({
    id: "c-taco",
    name: "Taco al pastor",
    aliases: ["tacos de pastor"],
    defaultPriceCents: 450,
  }),
  catalogItem({
    id: "c-agua",
    name: "Agua fresca",
    aliases: ["agua de jamaica"],
    defaultPriceCents: 300,
    taxable: false,
  }),
  catalogItem({ id: "c-salsa", name: "Salsa", defaultPriceCents: null }),
  catalogItem({ id: "c-limon", name: "Limón", defaultPriceCents: 50 }),
];

const item = (name: string, unitCents: number | null = null, qty = 1) => ({
  name,
  qty,
  unitCents,
  confidence: 0.9,
});

describe("matchCatalog", () => {
  it("matches a plural spoken name to the singular catalog name", () => {
    const [m] = matchCatalog([item("tacos al pastor", null, 2)], catalog);
    expect(m?.catalogItemId).toBe("c-taco");
    expect(m?.unitCents).toBe(450);
    expect(m?.qty).toBe(2);
  });

  it("matches case- and accent-insensitively in both directions", () => {
    expect(matchCatalog([item("LIMON")], catalog)[0]?.catalogItemId).toBe("c-limon");
    expect(matchCatalog([item("limón")], catalog)[0]?.catalogItemId).toBe("c-limon");
    const upperAccented = [catalogItem({ id: "x", name: "LIMÓN" })];
    expect(matchCatalog([item("limon")], upperAccented)[0]?.catalogItemId).toBe("x");
  });

  it("matches on aliases", () => {
    const [m] = matchCatalog([item("Tacos de Pastor")], catalog);
    expect(m?.catalogItemId).toBe("c-taco");
  });

  it("keeps the model's price for an unmatched item and leaves catalogItemId unset", () => {
    const [m] = matchCatalog([item("sombrero", 1200)], catalog);
    expect(m?.catalogItemId).toBeUndefined();
    expect(m?.unitCents).toBe(1200);
    expect(m?.taxable).toBe(true);
  });

  it("fills the default price and taxable flag from the catalog when the model gave no price", () => {
    const [m] = matchCatalog([item("agua fresca", null)], catalog);
    expect(m?.catalogItemId).toBe("c-agua");
    expect(m?.unitCents).toBe(300);
    expect(m?.taxable).toBe(false);
  });

  it("prefers the spoken price over the catalog default", () => {
    const [m] = matchCatalog([item("taco al pastor", 500)], catalog);
    expect(m?.unitCents).toBe(500);
  });

  it("leaves unitCents null when neither the model nor the catalog has a price", () => {
    const [matched, unmatched] = matchCatalog([item("salsa", null), item("mystery", null)], catalog);
    expect(matched?.catalogItemId).toBe("c-salsa");
    expect(matched?.unitCents).toBeNull();
    expect(unmatched?.catalogItemId).toBeUndefined();
    expect(unmatched?.unitCents).toBeNull();
  });

  it("does not match a different item that merely shares a word", () => {
    const [m] = matchCatalog([item("agua mineral")], catalog);
    expect(m?.catalogItemId).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const input = [item("salsa")];
    matchCatalog(input, catalog);
    expect(input[0]).toEqual(item("salsa"));
  });
});
