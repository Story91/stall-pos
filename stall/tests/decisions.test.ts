import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { bills, decisions, payouts, shifts } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb } from "@/db/test-db";
import { resolveDecision } from "@/lib/decisions";
import { logBill, logShift } from "@/lib/obligations";
import { PayPalError } from "@/lib/paypal/client";
import { PayoutDuplicateError } from "@/lib/paypal/payouts";
import { getBusiness } from "@/lib/sales";
import { obligationBatchId } from "@/lib/close/batchId";

type PayoutInput = { batchId: string; receiverEmail: string; cents: number; note: string };
const okPayout = () =>
  vi.fn(async (input: PayoutInput) => ({
    batchId: input.batchId,
    paypalBatchId: `PB-${input.batchId.slice(-8)}`,
    status: "PENDING",
  }));

let db: Db;
let close: () => Promise<void>;
let businessId: string;
let mariaId: string;
let rosaId: string;
let n = 0;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  const seeded = await seed(db);
  businessId = (await getBusiness(db)).id;
  mariaId = seeded.payees.maria;
  rosaId = seeded.payees.rosa;
}, 60_000);

afterAll(async () => {
  await close();
});

/** A held bill with an open decision, as the close agent leaves it. */
async function heldBill(amountCents = 90000) {
  const bill = await logBill(db, businessId, {
    payeeId: rosaId,
    amountCents,
    note: "tortillas",
    date: `2031-04-${String(++n).padStart(2, "0")}`,
  });
  await db.update(bills).set({ status: "held" }).where(eq(bills.id, bill.id));
  const [decision] = await db
    .insert(decisions)
    .values({
      businessId,
      date: bill.date,
      type: "over_limit",
      reason: "over the supplier limit",
      source: {},
      billId: bill.id,
    })
    .returning();
  return { bill, decision: decision! };
}

const billStatus = async (id: string) =>
  (await db.select().from(bills).where(eq(bills.id, id)))[0]!.status;
const decisionStatus = async (id: string) =>
  (await db.select().from(decisions).where(eq(decisions.id, id)))[0]!.status;

describe("resolveDecision approve", () => {
  it("pays a bill, records a PENDING payout and marks decision and bill", async () => {
    const { bill, decision } = await heldBill();
    const createPayout = okPayout();
    const result = await resolveDecision(db, { createPayout }, decision.id, "approve");

    const batchId = obligationBatchId(businessId, "bill", bill.id);
    expect(createPayout).toHaveBeenCalledTimes(1);
    expect(createPayout).toHaveBeenCalledWith({
      batchId,
      receiverEmail: "rosa@stall.example",
      cents: 90000,
      note: `Stall: bill ${bill.date}`,
    });
    expect(result).toMatchObject({ ok: true, decision: { id: decision.id, status: "approved" } });
    const [payout] = await db.select().from(payouts).where(eq(payouts.billId, bill.id));
    expect(payout).toMatchObject({
      batchId,
      paypalBatchId: expect.stringMatching(/^PB-/),
      amountCents: 90000,
      status: "PENDING",
      rationale: "Approved by owner",
    });
    expect(result.ok && result.payout?.id).toBe(payout!.id);
    expect(await billStatus(bill.id)).toBe("paid");
    expect(await decisionStatus(decision.id)).toBe("approved");
  });

  it("pays a shift at the payee's daily rate", async () => {
    const shift = await logShift(db, businessId, mariaId, "2031-05-01");
    const [decision] = await db
      .insert(decisions)
      .values({
        businessId,
        date: "2031-05-01",
        type: "escalated",
        reason: "r",
        source: {},
        shiftId: shift.id,
      })
      .returning();
    const createPayout = okPayout();
    const result = await resolveDecision(db, { createPayout }, decision!.id, "approve");
    expect(createPayout).toHaveBeenCalledWith({
      batchId: obligationBatchId(businessId, "shift", shift.id),
      receiverEmail: "maria@stall.example",
      cents: 12000,
      note: "Stall: shift 2031-05-01",
    });
    expect(result.ok).toBe(true);
    const [payout] = await db.select().from(payouts).where(eq(payouts.shiftId, shift.id));
    expect(payout?.amountCents).toBe(12000);
    expect(await db.select().from(shifts).where(eq(shifts.id, shift.id))).toHaveLength(1);
  });

  it("a second action on a resolved decision is already_resolved and pays nothing", async () => {
    const { decision } = await heldBill();
    const createPayout = okPayout();
    await resolveDecision(db, { createPayout }, decision.id, "approve");
    const again = await resolveDecision(db, { createPayout }, decision.id, "approve");
    const declined = await resolveDecision(db, { createPayout }, decision.id, "decline");
    expect(again).toEqual({ ok: false, error: "already_resolved" });
    expect(declined).toEqual({ ok: false, error: "already_resolved" });
    expect(createPayout).toHaveBeenCalledTimes(1);
  });

  it("two concurrent approvals pay once", async () => {
    const { bill, decision } = await heldBill();
    const createPayout = okPayout();
    const results = await Promise.all([
      resolveDecision(db, { createPayout }, decision.id, "approve"),
      resolveDecision(db, { createPayout }, decision.id, "approve"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(createPayout).toHaveBeenCalledTimes(1);
    expect(await db.select().from(payouts).where(eq(payouts.billId, bill.id))).toHaveLength(1);
  });

  it("a PayPal failure changes nothing and reports paypal", async () => {
    const { bill, decision } = await heldBill();
    const createPayout = vi.fn(async () => {
      throw new PayPalError("down", 500, "{}", "dbg");
    });
    const result = await resolveDecision(db, { createPayout }, decision.id, "approve");
    expect(result).toMatchObject({ ok: false, error: "paypal" });
    expect(await billStatus(bill.id)).toBe("held");
    expect(await decisionStatus(decision.id)).toBe("open");
    expect(await db.select().from(payouts).where(eq(payouts.billId, bill.id))).toHaveLength(0);
  });

  it("duplicate batch with a live payout row: approved, bill paid, no second row", async () => {
    const { bill, decision } = await heldBill();
    const batchId = obligationBatchId(businessId, "bill", bill.id);
    await db.insert(payouts).values({
      businessId,
      billId: bill.id,
      batchId,
      paypalBatchId: "PB-EXISTING",
      amountCents: 90000,
      status: "SUCCESS",
      rationale: "earlier",
    });
    const createPayout = vi.fn(async () => {
      throw new PayoutDuplicateError(batchId);
    });
    const result = await resolveDecision(db, { createPayout }, decision.id, "approve");
    expect(result).toMatchObject({ ok: true, decision: { status: "approved" } });
    expect(await billStatus(bill.id)).toBe("paid");
    expect(await db.select().from(payouts).where(eq(payouts.billId, bill.id))).toHaveLength(1);
  });

  it("duplicate batch with no payout row: error, nothing changes", async () => {
    const { bill, decision } = await heldBill();
    const createPayout = vi.fn(async (input: PayoutInput) => {
      throw new PayoutDuplicateError(input.batchId);
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await resolveDecision(db, { createPayout }, decision.id, "approve");
    expect(spy).toHaveBeenCalledWith("payout unrecorded", {
      batchId: obligationBatchId(businessId, "bill", bill.id),
    });
    spy.mockRestore();
    expect(result).toEqual({ ok: false, error: "payout_exists_unrecorded" });
    expect(await billStatus(bill.id)).toBe("held");
    expect(await decisionStatus(decision.id)).toBe("open");
  });

  it("duplicate batch whose payout FAILED is not treated as paid", async () => {
    const { bill, decision } = await heldBill();
    await db.insert(payouts).values({
      businessId,
      billId: bill.id,
      batchId: obligationBatchId(businessId, "bill", bill.id),
      amountCents: 90000,
      status: "FAILED",
      rationale: "earlier",
    });
    const createPayout = vi.fn(async (input: PayoutInput) => {
      throw new PayoutDuplicateError(input.batchId);
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await resolveDecision(db, { createPayout }, decision.id, "approve");
    spy.mockRestore();
    expect(result.ok).toBe(false);
    expect(await billStatus(bill.id)).toBe("held");
    expect(await decisionStatus(decision.id)).toBe("open");
  });

  it("a live payout already on record skips PayPal and just settles", async () => {
    const { bill, decision } = await heldBill();
    await db.insert(payouts).values({
      businessId,
      billId: bill.id,
      batchId: obligationBatchId(businessId, "bill", bill.id),
      paypalBatchId: "PB-LIVE",
      amountCents: 90000,
      status: "PENDING",
      rationale: "earlier",
    });
    const createPayout = okPayout();
    const result = await resolveDecision(db, { createPayout }, decision.id, "approve");
    expect(createPayout).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, decision: { status: "approved" }, payout: { paypalBatchId: "PB-LIVE" } });
    expect(await billStatus(bill.id)).toBe("paid");
    expect(await db.select().from(payouts).where(eq(payouts.billId, bill.id))).toHaveLength(1);
  });

  it("if settling fails after PayPal paid, the payout row persists and a retry pays nothing more", async () => {
    const { bill, decision } = await heldBill();
    const flaky = new Proxy(db, {
      get(target, prop) {
        if (prop === "transaction") {
          return async () => {
            throw new Error("db went away");
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const createPayout = okPayout();
    await expect(resolveDecision(flaky, { createPayout }, decision.id, "approve")).rejects.toThrow("db went away");
    expect(createPayout).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(payouts).where(eq(payouts.billId, bill.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "PENDING", paypalBatchId: expect.stringMatching(/^PB-/) });
    expect(await decisionStatus(decision.id)).toBe("open");

    const retry = await resolveDecision(db, { createPayout }, decision.id, "approve");
    expect(retry).toMatchObject({ ok: true, decision: { status: "approved" }, payout: { id: rows[0]!.id } });
    expect(createPayout).toHaveBeenCalledTimes(1);
    expect(await billStatus(bill.id)).toBe("paid");
  });
});

describe("resolveDecision decline and mark_paid", () => {
  it("decline marks decision and bill declined and never calls PayPal", async () => {
    const { bill, decision } = await heldBill();
    const createPayout = okPayout();
    const result = await resolveDecision(db, { createPayout }, decision.id, "decline");
    expect(result).toMatchObject({ ok: true, decision: { status: "declined" } });
    expect(createPayout).not.toHaveBeenCalled();
    expect(await billStatus(bill.id)).toBe("declined");
    expect(await db.select().from(payouts).where(eq(payouts.billId, bill.id))).toHaveLength(0);
  });

  it("mark_paid marks bill paid without a payout or PayPal call", async () => {
    const { bill, decision } = await heldBill();
    const createPayout = okPayout();
    const result = await resolveDecision(db, { createPayout }, decision.id, "mark_paid");
    expect(result).toMatchObject({ ok: true, decision: { status: "marked_paid" } });
    expect(createPayout).not.toHaveBeenCalled();
    expect(await billStatus(bill.id)).toBe("paid");
    expect(await db.select().from(payouts).where(eq(payouts.billId, bill.id))).toHaveLength(0);
  });

  it("decline and mark_paid refuse a bill that is already paid or has a live payout", async () => {
    const createPayout = okPayout();
    const paid = await heldBill();
    await db.update(bills).set({ status: "paid" }).where(eq(bills.id, paid.bill.id));
    expect(await resolveDecision(db, { createPayout }, paid.decision.id, "decline")).toEqual({
      ok: false,
      error: "already_paid",
    });
    expect(await billStatus(paid.bill.id)).toBe("paid");

    const live = await heldBill();
    await db.insert(payouts).values({
      businessId,
      billId: live.bill.id,
      batchId: obligationBatchId(businessId, "bill", live.bill.id),
      amountCents: 90000,
      status: "SUCCESS",
      rationale: "earlier",
    });
    expect(await resolveDecision(db, { createPayout }, live.decision.id, "mark_paid")).toEqual({
      ok: false,
      error: "already_paid",
    });
    expect(await billStatus(live.bill.id)).toBe("held");
    expect(await decisionStatus(live.decision.id)).toBe("open");
    expect(createPayout).not.toHaveBeenCalled();
  });

  it("an unknown or malformed decision id is not_found", async () => {
    const createPayout = okPayout();
    expect(
      await resolveDecision(db, { createPayout }, "00000000-0000-0000-0000-000000000000", "decline"),
    ).toEqual({ ok: false, error: "not_found" });
    expect(await resolveDecision(db, { createPayout }, "junk", "decline")).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
