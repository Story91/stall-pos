import { describe, expect, it } from "vitest";
import { reconcileDay, type LedgerPayout, type LedgerSale } from "@/lib/close/reconcile";
import type { PayPalTxn } from "@/lib/paypal/reporting";

const tz = "America/Chicago";
const date = "2026-11-04";
// 2026-11-04 in Chicago is 06:00Z on the 4th to 06:00Z on the 5th.
const now = new Date("2026-11-05T05:00:00Z");

const sale = (id: string, cents: number, paidAt: string, invoiceNumber: string | null = `STALL-${id}`): LedgerSale => ({
  id, invoiceId: `INV2-${id}`, invoiceNumber, totalCents: cents, paidAt,
});
const payout = (id: string, cents: number, status: LedgerPayout["status"] = "SUCCESS"): LedgerPayout => ({
  id, label: "Maria", amountCents: cents, status, createdAt: "2026-11-04T20:00:00Z",
});
const txn = (id: string, cents: number, at: string, invoiceId: string | null = null, status = "S"): PayPalTxn => ({
  id, at, cents, currency: "USD", status, invoiceId, code: null,
});

describe("reconcileDay", () => {
  it("matches sales by invoice number and payouts by amount", () => {
    const r = reconcileDay({
      date, tz, now,
      sales: [sale("a", 1250, "2026-11-04T18:00:00Z"), sale("b", 800, "2026-11-04T19:00:00Z")],
      payouts: [payout("p", 12000)],
      txns: [
        txn("t1", 1250, "2026-11-04T18:00:05Z", "STALL-a"),
        txn("t2", 800, "2026-11-04T19:00:05Z", "STALL-b"),
        txn("t3", -12000, "2026-11-04T20:00:10Z"),
      ],
    });
    expect(r.status).toBe("match");
    expect(r.matched).toBe(3);
    expect(r.stall).toEqual({ inCents: 2050, outCents: 12000 });
    expect(r.paypal).toEqual({ inCents: 2050, outCents: 12000 });
    expect(r.other).toEqual([]);
  });

  it("falls back to amount on the same day when PayPal gives no invoice reference", () => {
    const r = reconcileDay({
      date, tz, now, payouts: [],
      sales: [sale("a", 1250, "2026-11-04T18:00:00Z")],
      txns: [txn("t1", 1250, "2026-11-04T18:00:05Z")],
    });
    expect(r.status).toBe("match");
  });

  it("calls an old missing item a gap and a fresh one waiting", () => {
    const r = reconcileDay({
      date, tz, now, txns: [],
      sales: [sale("old", 500, "2026-11-04T12:00:00Z"), sale("new", 700, "2026-11-05T04:30:00Z")],
      payouts: [],
    });
    expect(r.status).toBe("gaps");
    expect(r.missing.map((m) => [m.id, m.recent])).toEqual([["old", false], ["new", true]]);

    const fresh = reconcileDay({ date, tz, now, txns: [], payouts: [], sales: [sale("new", 700, "2026-11-05T04:30:00Z")] });
    expect(fresh.status).toBe("waiting");
  });

  it("ignores pending, failed and denied/reversed money; lists outside activity separately", () => {
    const r = reconcileDay({
      date, tz, now, sales: [],
      payouts: [payout("p1", 12000, "PENDING"), payout("p2", 5000, "FAILED")],
      txns: [
        txn("x", 999, "2026-11-04T15:00:00Z"),
        txn("rev", 1250, "2026-11-04T15:00:00Z", null, "V"),
        txn("yesterday", 300, "2026-11-04T03:00:00Z"),
      ],
    });
    expect(r.status).toBe("match");
    expect(r.stall.outCents).toBe(0);
    expect(r.other.map((o) => o.id)).toEqual(["x"]);
  });

  it("does not use one PayPal transaction for two ledger items", () => {
    const r = reconcileDay({
      date, tz, now, payouts: [],
      sales: [sale("a", 500, "2026-11-04T12:00:00Z", null), sale("b", 500, "2026-11-04T12:05:00Z", null)],
      txns: [txn("t1", 500, "2026-11-04T12:00:05Z")],
    });
    expect(r.matched).toBe(1);
    expect(r.missing).toHaveLength(1);
  });
});
