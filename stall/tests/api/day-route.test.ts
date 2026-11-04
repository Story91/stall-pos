import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { sales } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb } from "@/db/test-db";
import { businessDate } from "@/lib/dates";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(holder.db as object, prop) }),
}));

import { GET as dayGet } from "@/app/api/day/[date]/route";
import { ownerCookieValue } from "@/lib/auth";

const TZ = "America/Chicago";
const today = businessDate(new Date(), TZ);
let db: Db;
let close: () => Promise<void>;
let businessId: string;

type Day = { sales: unknown[]; totals: { count: number; totalCents: number } };
async function dayOf(date: string): Promise<Day> {
  const res = await dayGet(
    new Request(`http://localhost/api/day/${date}`, {
      headers: { Cookie: `stall_owner=${ownerCookieValue()}` },
    }),
    { params: Promise.resolve({ date }) },
  );
  return (await res.json()) as Day;
}

const base = {
  status: "paid" as const,
  lines: [],
  subtotalCents: 1000,
  taxCents: 83,
  tipCents: 0,
  totalCents: 1083,
  language: "en" as const,
  transcript: "x",
};

beforeAll(async () => {
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("OWNER_PIN", "1234");
  vi.stubEnv("CLOSE_TRIGGER_KEY", "close-key-for-tests");
  ({ db, close } = await createTestDb());
  holder.db = db;
  ({ businessId } = await seed(db));
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await close();
});

describe("GET /api/day/:date sales", () => {
  it("shows none of the seeded history as today, with zero totals", async () => {
    const day = await dayOf(today);
    expect(day.sales).toHaveLength(0);
    expect(day.totals.count).toBe(0);
    expect(day.totals.totalCents).toBe(0);
  });

  it("shows a sale paid today", async () => {
    const now = new Date();
    await db.insert(sales).values({ ...base, businessId, draftId: "day-1", createdAt: now, paidAt: now });
    const day = await dayOf(today);
    expect(day.sales).toHaveLength(1);
    expect(day.totals).toMatchObject({ count: 1, totalCents: 1083 });
  });

  it("counts a sale created yesterday but paid today on today, not yesterday", async () => {
    const now = new Date();
    const yesterday = businessDate(new Date(now.getTime() - 24 * 3_600_000), TZ);
    const yesterdayBefore = (await dayOf(yesterday)).sales.length;
    await db.insert(sales).values({
      ...base,
      businessId,
      draftId: "day-2",
      createdAt: new Date(now.getTime() - 24 * 3_600_000),
      paidAt: now,
    });
    const day = await dayOf(today);
    expect(day.sales).toHaveLength(2);
    expect(day.totals.count).toBe(2);
    expect((await dayOf(yesterday)).sales).toHaveLength(yesterdayBefore);
  });
});
