import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export { schema };

// Common drizzle type shared by the node-postgres driver (`db`) and PGlite
// (`createTestDb`), so application code can accept either.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type NodePgDb = ReturnType<typeof drizzle<typeof schema>>;

let cached: NodePgDb | undefined;

function connect(): NodePgDb {
  cached ??= drizzle(new Pool({ connectionString: env.DATABASE_URL }), {
    schema,
  });
  return cached;
}

// Connects on first property access, so importing this module (tests, `next
// build`) never needs DATABASE_URL.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    if (typeof prop === "symbol" || prop === "then") return undefined;
    const target = connect();
    const value = Reflect.get(target, prop, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
