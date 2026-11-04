import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";
import { businessDate } from "@/lib/dates";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(holder.db as object, prop) }),
}));

import { GET } from "@/app/api/business/route";
import { ownerCookieValue } from "@/lib/auth";

describe("GET /api/business", () => {
  let close: () => Promise<void>;

  beforeAll(async () => {
    const test = await createTestDb();
    holder.db = test.db;
    close = test.close;
    await seed(test.db);
    vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OWNER_PIN", "1234");
    vi.stubEnv("CLOSE_TRIGGER_KEY", "close-key-for-tests");
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it("returns the name, the tax rate as a number, the currency and today's business date", async () => {
    const response = await GET(
      new Request("http://localhost/api/business", {
        headers: { Cookie: `stall_owner=${ownerCookieValue()}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "La Esquina",
      taxRate: 0.0825,
      currency: "USD",
      tz: "America/Chicago",
      today: businessDate(new Date(), "America/Chicago"),
    });
  });

  it("requires the owner cookie", async () => {
    expect((await GET(new Request("http://localhost/api/business"))).status).toBe(401);
  });
});
