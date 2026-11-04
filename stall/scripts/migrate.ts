import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { applyMigrations, isPgliteUrl, openPglite } from "../src/db/pglite";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

if (isPgliteUrl(url)) {
  const local = openPglite(url);
  try {
    await applyMigrations(local.db);
    console.log("Migrations applied.");
  } finally {
    await local.close();
  }
} else {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}
