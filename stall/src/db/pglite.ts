import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

// `DATABASE_URL=pglite://<dir>` runs Postgres in-process (PGlite) with the data
// in <dir>; `pglite://memory` keeps it in RAM. No Postgres install needed.

const SCHEME = "pglite://";

export type PgliteDb = PgliteDatabase<typeof schema>;

export function isPgliteUrl(url: string): boolean {
  return url.startsWith(SCHEME);
}

/** The data directory, or undefined for `pglite://memory`. */
export function pgliteDataDir(url: string): string | undefined {
  const rest = url.slice(SCHEME.length);
  return rest === "memory" || rest === "" ? undefined : rest;
}

/** Applies the SQL migrations in stall/drizzle (idempotent). */
export async function applyMigrations(
  db: PgliteDb,
  migrationsFolder = join(process.cwd(), "drizzle"),
): Promise<void> {
  await migrate(db, { migrationsFolder });
}

/** Opens PGlite and wraps it in drizzle, with no migrations or seed applied. */
export function openPglite(url: string): {
  client: PGlite;
  db: PgliteDb;
  close(): Promise<void>;
} {
  const dir = pgliteDataDir(url);
  if (dir) mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  return { client, db: drizzle(client, { schema }), close: () => client.close() };
}

/**
 * Migrates, then seeds the demo business when the database is empty. Seeding
 * is never repeated: an existing business (and its data) is left alone.
 */
export async function ensureReady(db: PgliteDb): Promise<{ seeded: boolean }> {
  await applyMigrations(db);
  const existing = await db.select({ id: schema.businesses.id }).from(schema.businesses).limit(1);
  if (existing.length > 0) return { seeded: false };
  const { seed } = await import("./seed");
  await seed(db);
  console.log("stall: empty PGlite database, seeded the La Esquina demo data");
  return { seeded: true };
}

/** Opens PGlite, then migrates and seeds-if-empty. */
export async function initPglite(url: string) {
  const handle = openPglite(url);
  await ensureReady(handle.db);
  return { ...handle, ensureReady: () => ensureReady(handle.db) };
}
