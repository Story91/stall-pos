import { describe, expect, it } from "vitest";
import { payoutPayee, type PayoutRow } from "@/lib/owner/types";

const base: PayoutRow = {
  id: "p1",
  shiftId: null,
  billId: "b1",
  batchId: "st-b-a1b2c3d4e5f60718293a4b5c6",
  amountCents: 100,
  status: "SUCCESS",
  rationale: "r",
  createdAt: "2026-11-04T10:00:00Z",
};

describe("payoutPayee", () => {
  it("prefers the server-resolved payee name", () => {
    expect(payoutPayee({ ...base, payeeName: "Tortillería Rosa" }, new Map())).toBe("Tortillería Rosa");
  });
  it("falls back to the day's names, then to Unknown payee", () => {
    expect(payoutPayee(base, new Map([["b1", "Rosa"]]))).toBe("Rosa");
    expect(payoutPayee(base, new Map())).toBe("Unknown payee");
  });
});
