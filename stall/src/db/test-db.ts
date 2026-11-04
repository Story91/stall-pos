import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "./index";
import { applyMigrations } from "./pglite";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

// In-memory Postgres (PGlite) with the real migrations applied.
export async function createTestDb(): Promise<{
  db: Db;
  close(): Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await applyMigrations(db, migrationsFolder);
  return { db, close: () => client.close() };
}
