import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { shifts } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb } from "@/db/test-db";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(holder.db as object, prop) }),
}));

import { GET as businessGet, PATCH as businessPatch } from "@/app/api/business/route";
import { GET as catalogGet } from "@/app/api/catalog/route";
import { GET as payeesGet } from "@/app/api/payees/route";
import { PATCH as payeePatch } from "@/app/api/payees/[id]/route";
import { POST as resetPost } from "@/app/api/reset-demo/route";
import { ownerCookieValue } from "@/lib/auth";

let db: Db;
let close: () => Promise<void>;
let owner: string;

function req(method: string, url: string, body?: unknown, cookie: string | null = owner): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: `stall_owner=${cookie}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("OWNER_PIN", "1234");
  vi.stubEnv("CLOSE_TRIGGER_KEY", "close-key-for-tests");
  owner = ownerCookieValue();
  const test = await createTestDb();
  db = test.db;
  holder.db = db;
  close = test.close;
  await seed(db);
}, 60_000);

afterAll(async () => {
  await close();
});

describe("settings routes", () => {
  it("require the owner cookie", async () => {
    expect((await businessGet(req("GET", "/api/business", undefined, null))).status).toBe(401);
    expect((await payeesGet(req("GET", "/api/payees", undefined, null))).status).toBe(401);
    expect((await catalogGet(req("GET", "/api/catalog", undefined, null))).status).toBe(401);
    expect((await resetPost(req("POST", "/api/reset-demo", undefined, null))).status).toBe(401);
    expect(
      (await businessPatch(req("PATCH", "/api/business", { name: "X" }, null))).status,
    ).toBe(401);
  });

  it("lists payees by name and the catalog", async () => {
    const payees = (await (await payeesGet(req("GET", "/api/payees"))).json()) as {
      name: string;
      email: string;
    }[];
    expect(payees.map((p) => p.name)).toEqual(["Maria", "Tortillería Rosa"]);
    // Masked on the server: first letter and domain only.
    expect(payees.map((p) => p.email)).toEqual(["m••••@stall.example", "r••••@stall.example"]);
    const catalog = (await (await catalogGet(req("GET", "/api/catalog"))).json()) as unknown[];
    expect(catalog.length).toBeGreaterThan(0);
  });

  it("patches the name and tax rate, and rejects bad values", async () => {
    const res = await businessPatch(req("PATCH", "/api/business", { name: "Taquería Sol", taxRate: 0.07 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Taquería Sol", taxRate: 0.07 });
    expect(await (await businessGet(req("GET", "/api/business"))).json()).toMatchObject({ name: "Taquería Sol", taxRate: 0.07 });

    expect((await businessPatch(req("PATCH", "/api/business", { taxRate: 0.5 }))).status).toBe(400);
    expect((await businessPatch(req("PATCH", "/api/business", {}))).status).toBe(400);
  });

  it("reset-demo reseeds: the patch and extra rows are gone", async () => {
    const before = await db.select().from(shifts);
    const res = await resetPost(req("POST", "/api/reset-demo"));
    expect(await res.json()).toEqual({ ok: true });
    expect(await (await businessGet(req("GET", "/api/business"))).json()).toMatchObject({ name: "La Esquina", taxRate: 0.0825 });
    expect((await db.select().from(shifts)).length).toBe(before.length);
  });
});

describe("PATCH /api/payees/[id]", () => {
  const patch = (id: string, body: unknown, cookie: string | null = owner) =>
    payeePatch(req("PATCH", `/api/payees/${id}`, body, cookie), { params: Promise.resolve({ id }) });
  const byName = async (name: string) => {
    const rows = (await (await payeesGet(req("GET", "/api/payees"))).json()) as { id: string; name: string }[];
    return rows.find((r) => r.name === name)!.id;
  };

  it("changes a helper's day rate, limit and auto-pay, with the email still masked", async () => {
    const maria = await byName("Maria");
    const res = await patch(maria, { dailyRateCents: 13000, maxPerDayCents: 15000, autoPay: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      dailyRateCents: 13000,
      maxPerDayCents: 15000,
      autoPay: false,
      email: "m••••@stall.example",
    });
  });

  it("refuses a rate over the limit, a rate for a supplier, a cap over $1,000, strangers and unknown ids", async () => {
    const maria = await byName("Maria");
    const rosa = await byName("Tortillería Rosa");
    expect(await (await patch(maria, { dailyRateCents: 20000 })).json()).toEqual({ error: "rate_over_limit" });
    expect((await patch(rosa, { dailyRateCents: 5000 })).status).toBe(400);
    expect((await patch(maria, { maxPerDayCents: 100_001 })).status).toBe(400);
    expect((await patch(maria, { email: "x@y.z" })).status).toBe(400);
    expect((await patch(maria, {})).status).toBe(400);
    expect((await patch(maria, { autoPay: true }, null)).status).toBe(401);
    expect((await patch("00000000-0000-4000-8000-000000000000", { autoPay: true })).status).toBe(404);
    expect((await patch("not-a-uuid", { autoPay: true })).status).toBe(404);
  });
});
