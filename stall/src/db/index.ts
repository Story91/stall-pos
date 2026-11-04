import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "@/lib/env";
import { ensureReady, isPgliteUrl, openPglite } from "./pglite";
import * as schema from "./schema";

export { schema };
export type {
  AgentRun,
  Bill,
  Business,
  CatalogItem,
  Decision,
  Payee,
  Payout,
  Sale,
  Shift,
  WebhookEvent,
} from "./schema";

// Common drizzle type shared by the node-postgres driver (`db`) and PGlite
// (`createTestDb`), so application code can accept either.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// Cached on globalThis (the standard Next dev-HMR pattern): a re-evaluated module
// must reuse the open client, since a second PGlite on one data directory corrupts it.
const CACHE_KEY = Symbol.for("stall.db");
type GlobalWithDb = typeof globalThis & { [CACHE_KEY]?: Db };

/**
 * PGlite starts asynchronously (WASM boot, migrations, first-run seed), but
 * `db` is used synchronously. Every client call waits for that start-up first.
 */
function gateClient<T extends object>(client: T, ready: Promise<unknown>): T {
  return new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        await ready;
        return value.apply(target, args);
      };
    },
  });
}

function connectPglite(url: string): Db {
  const { client, db: raw } = openPglite(url);
  const ready = ensureReady(raw);
  void ready.catch(() => {}); // the first query that awaits it surfaces the error
  return drizzlePglite(gateClient(client, ready), { schema });
}

/** The process-wide db, opened on first use. */
export function connect(): Db {
  const g = globalThis as GlobalWithDb;
  g[CACHE_KEY] ??= isPgliteUrl(env.DATABASE_URL)
    ? connectPglite(env.DATABASE_URL)
    : drizzle(new Pool({ connectionString: env.DATABASE_URL }), { schema });
  return g[CACHE_KEY];
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
