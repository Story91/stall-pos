import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { businesses, catalogItems } from "@/db/schema";
import { listCatalog, recordSightings } from "@/lib/catalog";

describe("catalog learning", () => {
  let db: Db;
  let close: () => Promise<void>;

  async function newBusiness(name: string): Promise<string> {
    const [row] = await db
      .insert(businesses)
      .values({
        name,
        taxRate: "0.082500",
        tz: "America/Chicago",
        ownerPinHash: "0".repeat(64),
      })
      .returning({ id: businesses.id });
    return row!.id;
  }

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it("creates a new name with one sighting and no default price", async () => {
    const id = await newBusiness("First Sighting Co");
    await recordSightings(db, id, [{ name: "Horchata", unitCents: 350 }]);

    const rows = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.businessId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Horchata",
      aliases: [],
      defaultPriceCents: null,
      taxable: true,
      sightings: 1,
      lastSeenPriceCents: 350,
    });
  });

  it("sets the default price on the second sighting at the same price", async () => {
    const id = await newBusiness("Same Price Co");
    await recordSightings(db, id, [{ name: "Taco", unitCents: 300 }]);
    await recordSightings(db, id, [{ name: "Taco", unitCents: 300 }]);

    const [row] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.businessId, id));
    expect(row).toMatchObject({
      name: "Taco",
      sightings: 2,
      defaultPriceCents: 300,
      lastSeenPriceCents: 300,
    });
  });

  it("leaves the default price unset when the second sighting has a different price", async () => {
    const id = await newBusiness("Changed Price Co");
    await recordSightings(db, id, [{ name: "Taco", unitCents: 300 }]);
    await recordSightings(db, id, [{ name: "Taco", unitCents: 325 }]);

    const [row] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.businessId, id));
    expect(row).toMatchObject({
      sightings: 2,
      defaultPriceCents: null,
      lastSeenPriceCents: 325,
    });
  });

  it("never overwrites an existing non-null default price", async () => {
    const id = await newBusiness("Locked Price Co");
    await db.insert(catalogItems).values({
      businessId: id,
      name: "Quesadilla",
      defaultPriceCents: 800,
      sightings: 5,
      lastSeenPriceCents: 800,
    });

    await recordSightings(db, id, [{ name: "Quesadilla", unitCents: 900 }]);
    await recordSightings(db, id, [{ name: "Quesadilla", unitCents: 900 }]);

    const [row] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.businessId, id));
    expect(row).toMatchObject({
      sightings: 7,
      defaultPriceCents: 800,
      lastSeenPriceCents: 900,
    });
  });

  it("matches an existing row by alias, ignoring case and surrounding spaces", async () => {
    const id = await newBusiness("Alias Co");
    await db.insert(catalogItems).values({
      businessId: id,
      name: "Carne Asada Taco",
      aliases: ["tacos de asada"],
    });

    await recordSightings(db, id, [{ name: "  TACOS DE ASADA ", unitCents: 300 }]);

    const rows = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.businessId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Carne Asada Taco", sightings: 1 });
  });

  it("resolves by catalogItemId before falling back to the name", async () => {
    const id = await newBusiness("Id Co");
    const [horchata] = await db
      .insert(catalogItems)
      .values({ businessId: id, name: "Horchata", sightings: 1 })
      .returning({ id: catalogItems.id });

    await recordSightings(db, id, [
      { name: "Agua fresca", unitCents: 250, catalogItemId: horchata!.id },
    ]);

    const rows = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.businessId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: horchata!.id, sightings: 2 });
  });

  it("creates a row when the catalogItemId is not in this business", async () => {
    const id = await newBusiness("Unknown Id Co");
    const other = await newBusiness("Other Id Co");
    const [foreign] = await db
      .insert(catalogItems)
      .values({ businessId: other, name: "Flan" })
      .returning({ id: catalogItems.id });

    await recordSightings(db, id, [
      { name: "Flan", unitCents: 400, catalogItemId: foreign!.id },
    ]);

    const rows = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.businessId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Flan", sightings: 1 });
    expect(rows[0]!.id).not.toBe(foreign!.id);
  });

  it("does not match another business's items by name", async () => {
    const mine = await newBusiness("Isolation Mine");
    const theirs = await newBusiness("Isolation Theirs");
    await db
      .insert(catalogItems)
      .values({ businessId: theirs, name: "Elote", sightings: 4 });

    await recordSightings(db, mine, [{ name: "Elote", unitCents: 200 }]);

    const mineRows = await listCatalog(db, mine);
    expect(mineRows).toHaveLength(1);
    expect(mineRows[0]).toMatchObject({ name: "Elote", sightings: 1 });

    const theirRows = await listCatalog(db, theirs);
    expect(theirRows).toHaveLength(1);
    expect(theirRows[0]).toMatchObject({ sightings: 4 });
  });

  it("rolls back every item when one write in the call fails", async () => {
    const id = await newBusiness("Rollback Co");

    await expect(
      recordSightings(db, id, [
        { name: "Good Item", unitCents: 100 },
        { name: "Bad Item", unitCents: 100, catalogItemId: "not-a-uuid" },
      ]),
    ).rejects.toThrow();

    expect(await listCatalog(db, id)).toEqual([]);
  });

  it("lists only this business's items ordered by name", async () => {
    const id = await newBusiness("Ordering Co");
    const other = await newBusiness("Ordering Other Co");
    await recordSightings(db, id, [
      { name: "Mango", unitCents: 100 },
      { name: "Apple", unitCents: 100 },
      { name: "Banana", unitCents: 100 },
    ]);
    await recordSightings(db, other, [{ name: "Zebra", unitCents: 100 }]);

    const rows = await listCatalog(db, id);
    expect(rows.map((row) => row.name)).toEqual(["Apple", "Banana", "Mango"]);
  });
});
