import { afterAll, describe, expect, it, vi } from "vitest";
import { businesses } from "@/db/schema";
import {
  initPglite,
  isPgliteUrl,
  openPglite,
  pgliteDataDir,
} from "@/db/pglite";

describe("pglite:// database url", () => {
  it("recognises the scheme and extracts the data dir", () => {
    expect(isPgliteUrl("pglite://./.data/stall")).toBe(true);
    expect(isPgliteUrl("postgres://u:p@host/db")).toBe(false);
    expect(pgliteDataDir("pglite://./.data/stall")).toBe("./.data/stall");
    expect(pgliteDataDir("pglite://memory")).toBeUndefined();
  });

  const opened: Array<{ close(): Promise<void> }> = [];
  afterAll(async () => {
    for (const handle of opened) await handle.close();
  });

  it("builds an in-memory db, applies migrations and seeds on first connect", async () => {
    const handle = await initPglite("pglite://memory");
    opened.push(handle);
    const rows = await handle.db.select().from(businesses);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("La Esquina");
  }, 60_000);

  it("does not re-seed a database that already has a business", async () => {
    const handle = await initPglite("pglite://memory");
    opened.push(handle);
    const before = (await handle.db.select().from(businesses))[0]!.id;
    const { seeded } = await handle.ensureReady();
    expect(seeded).toBe(false);
    expect((await handle.db.select().from(businesses))[0]!.id).toBe(before);
  }, 60_000);

  it("reuses one db instance when the module is re-evaluated", async () => {
    vi.stubEnv("DATABASE_URL", "pglite://memory");
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "wh");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OWNER_PIN", "1234");
    vi.stubEnv("CLOSE_TRIGGER_KEY", "k");
    try {
      vi.resetModules();
      const first = (await import("@/db")).connect();
      vi.resetModules();
      const second = (await import("@/db")).connect();
      expect(second).toBe(first);
      expect(await first.select().from(businesses)).toHaveLength(1); // waits for migrate + seed
    } finally {
      delete (globalThis as Record<symbol, unknown>)[Symbol.for("stall.db")];
      vi.unstubAllEnvs();
    }
  }, 60_000);

  it("opens a raw db without migrating", async () => {
    const raw = openPglite("pglite://memory");
    opened.push(raw);
    await expect(raw.db.select().from(businesses)).rejects.toThrow();
  }, 30_000); // PGlite boots slowly when the whole suite runs in parallel.
});
