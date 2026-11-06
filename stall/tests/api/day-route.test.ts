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
  // The seed adds today's sales paid so far (none before lunch in Chicago) on top of a week of history.
  let seededToday: { count: number; totalCents: number };

  it("shows only the seeded sales paid today, none of the earlier history", async () => {
    const rows = await db.select().from(sales);
    const paidToday = rows.filter((s) => s.paidAt && businessDate(s.paidAt, TZ) === today);
    expect(paidToday.length).toBeLessThan(rows.length);
    seededToday = { count: paidToday.length, totalCents: paidToday.reduce((sum, s) => sum + s.totalCents, 0) };
    const day = await dayOf(today);
    expect(day.sales).toHaveLength(seededToday.count);
    expect(day.totals.count).toBe(seededToday.count);
    expect(day.totals.totalCents).toBe(seededToday.totalCents);
  });

  it("shows a sale paid today", async () => {
    const now = new Date();
    await db.insert(sales).values({ ...base, businessId, draftId: "day-1", createdAt: now, paidAt: now });
    const day = await dayOf(today);
    expect(day.sales).toHaveLength(seededToday.count + 1);
    expect(day.totals).toMatchObject({ count: seededToday.count + 1, totalCents: seededToday.totalCents + 1083 });
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
    expect(day.sales).toHaveLength(seededToday.count + 2);
    expect(day.totals.count).toBe(seededToday.count + 2);
    expect((await dayOf(yesterday)).sales).toHaveLength(yesterdayBefore);
  });
});
