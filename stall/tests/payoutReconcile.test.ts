import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { payouts } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb } from "@/db/test-db";
import { applyPayoutStatus } from "@/lib/paypal/payoutStatus";
import { subscribe } from "@/lib/events";
import { getDay } from "@/lib/obligations";
import { resetPayoutReconcileThrottle } from "@/lib/payoutReconcile";
import { getBusiness } from "@/lib/sales";

let db: Db;
let close: () => Promise<void>;
let businessId: string;
const DATE = "2031-02-03";
let n = 0;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  await seed(db);
  businessId = (await getBusiness(db)).id;
}, 60_000);
afterAll(async () => close());
beforeEach(() => resetPayoutReconcileThrottle());

async function newPayout(status: "PENDING" | "SUCCESS", paypalBatchId: string | null = `PB-${++n}`) {
  const [row] = await db
    .insert(payouts)
    .values({
      businessId,
      batchId: `st-test-${++n}`,
      paypalBatchId,
      amountCents: 1000,
      status,
      rationale: "test",
      createdAt: new Date(`${DATE}T18:00:00Z`),
    })
    .returning();
  return row!;
}
const statusOf = async (id: string) => (await db.select().from(payouts).where(eq(payouts.id, id)))[0]!;
const batch = (status: string) => ({ status: "PENDING", items: [{ itemId: "ITEM-1", status }] });

describe("payout reconciliation without webhooks", () => {
  it("moves PENDING to SUCCESS and stores the item id", async () => {
    const p = await newPayout("PENDING");
    const lookup = vi.fn().mockResolvedValue(batch("SUCCESS"));
    const day = await getDay(db, businessId, DATE, "UTC", { getPayoutBatch: lookup });
    expect(lookup).toHaveBeenCalledWith(p.paypalBatchId, { timeoutMs: 5000 });
    expect(await statusOf(p.id)).toMatchObject({ status: "SUCCESS", itemId: "ITEM-1" });
    expect(day.payouts.find((x) => x.id === p.id)?.status).toBe("SUCCESS");
  });

  it("maps UNCLAIMED and failure statuses", async () => {
    const a = await newPayout("PENDING");
    const b = await newPayout("PENDING");
    const lookup = vi.fn(async (id: string) => batch(id === a.paypalBatchId ? "UNCLAIMED" : "RETURNED"));
    await getDay(db, businessId, DATE, "UTC", { getPayoutBatch: lookup });
    expect((await statusOf(a.id)).status).toBe("UNCLAIMED");
    expect((await statusOf(b.id)).status).toBe("FAILED");
  });

  it("leaves the row PENDING while PayPal still says PENDING", async () => {
    const p = await newPayout("PENDING");
    await getDay(db, businessId, DATE, "UTC", { getPayoutBatch: vi.fn().mockResolvedValue(batch("PENDING")) });
    expect((await statusOf(p.id)).status).toBe("PENDING");
  });

  it("looks a payout up at most once per 5 seconds", async () => {
    const p = await newPayout("PENDING");
    const lookup = vi.fn().mockResolvedValue(batch("PENDING"));
    let now = 1_000_000;
    const deps = { getPayoutBatch: lookup, nowMs: () => now };
    const calls = () => lookup.mock.calls.filter(([id]) => id === p.paypalBatchId).length;
    await getDay(db, businessId, DATE, "UTC", deps);
    now += 4000;
    await getDay(db, businessId, DATE, "UTC", deps);
    expect(calls()).toBe(1);
    now += 1500;
    await getDay(db, businessId, DATE, "UTC", deps);
    expect(calls()).toBe(2);
  });

  it("swallows a PayPal error and leaves the row unchanged", async () => {
    const p = await newPayout("PENDING");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const lookup = vi.fn().mockRejectedValue(new Error("secret-token-xyz"));
    await expect(getDay(db, businessId, DATE, "UTC", { getPayoutBatch: lookup })).resolves.toBeDefined();
    expect((await statusOf(p.id)).status).toBe("PENDING");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token-xyz");
    log.mockRestore();
  });

  it("never looks up final rows or rows without a PayPal batch id", async () => {
    const done = await newPayout("SUCCESS");
    const none = await newPayout("PENDING", null);
    const lookup = vi.fn().mockResolvedValue(batch("FAILED"));
    await getDay(db, businessId, DATE, "UTC", { getPayoutBatch: lookup });
    expect(lookup.mock.calls.map(([id]) => id)).not.toContain(done.paypalBatchId);
    expect((await statusOf(done.id)).status).toBe("SUCCESS");
    expect((await statusOf(none.id)).status).toBe("PENDING");
  });

  it("does not let a stale PENDING snapshot overwrite a newer SUCCESS", async () => {
    const p = await newPayout("PENDING");
    await db.update(payouts).set({ status: "SUCCESS" }).where(eq(payouts.id, p.id));
    const seen: unknown[] = [];
    const off = subscribe((e) => seen.push(e));
    const result = await applyPayoutStatus(db, { id: p.id, status: "PENDING" }, "UNCLAIMED", "ITEM-9");
    off();
    expect(result).toBe("ignored");
    expect((await statusOf(p.id)).status).toBe("SUCCESS");
    expect(seen).toHaveLength(0);
  });
});
