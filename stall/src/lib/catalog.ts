import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { catalogItems, type CatalogItem } from "@/db/schema";

export type Sighting = {
  name: string;
  unitCents: number;
  catalogItemId?: string;
};

// matchCatalog.ts does not export its normalizer, so matching here is exact on
// the lowercased, trimmed label.
function key(label: string): string {
  return label.trim().toLowerCase();
}

// Resolve by id when given (and owned by this business), else by name or alias.
async function findItem(
  db: Db,
  businessId: string,
  sighting: Sighting,
): Promise<CatalogItem | undefined> {
  if (sighting.catalogItemId) {
    const [byId] = await db
      .select()
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.id, sighting.catalogItemId),
          eq(catalogItems.businessId, businessId),
        ),
      );
    if (byId) return byId;
  }

  const wanted = key(sighting.name);
  const rows = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.businessId, businessId));
  return rows.find((row) =>
    [row.name, ...row.aliases].some((label) => key(label) === wanted),
  );
}

/**
 * Learns from a completed sale: unknown names become catalog rows, and each
 * sighting bumps the count. A default price is set only once a repeat sighting
 * repeats the price of the previous one; an existing default is never changed.
 */
export async function recordSightings(
  db: Db,
  businessId: string,
  items: Sighting[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      const existing = await findItem(tx, businessId, item);

      if (!existing) {
        await tx.insert(catalogItems).values({
          businessId,
          name: item.name,
          aliases: [],
          defaultPriceCents: null,
          lastSeenPriceCents: item.unitCents,
          taxable: true,
          sightings: 1,
        });
        continue;
      }

      const isRepeat = existing.sightings >= 1;
      const matchesLastPrice = existing.lastSeenPriceCents === item.unitCents;
      const defaultPriceCents =
        existing.defaultPriceCents ??
        (isRepeat && matchesLastPrice ? item.unitCents : null);

      await tx
        .update(catalogItems)
        .set({
          sightings: sql`${catalogItems.sightings} + 1`,
          defaultPriceCents,
          lastSeenPriceCents: item.unitCents,
        })
        .where(eq(catalogItems.id, existing.id));
    }
  });
}

export async function listCatalog(
  db: Db,
  businessId: string,
): Promise<CatalogItem[]> {
  return db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.businessId, businessId))
    .orderBy(asc(catalogItems.name));
}
