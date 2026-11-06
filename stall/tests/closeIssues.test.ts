import { describe, expect, it } from "vitest";
import { errorKind, failedPayouts } from "@/lib/owner/closeIssues";
import { summarySentences } from "@/lib/owner/text";
import type { LogEntry, PayeeRow, PayoutRow } from "@/lib/owner/types";

const maria: PayeeRow = {
  id: "p1", name: "Maria", email: "m@x", role: "helper",
  dailyRateCents: 12000, maxPerDayCents: 20000, autoPay: true, enabled: true,
};
const day = { shifts: [{ id: "s1", payeeId: "p1", date: "2026-11-04", payee: maria }], bills: [] };
const entry = (step: number, tool: string, result: unknown): LogEntry => ({
  step, tool, input: { obligationId: "s1" }, result, at: "2026-11-05T02:40:00Z",
});

describe("errorKind", () => {
  it("maps raw errors to plain categories", () => {
    expect(errorKind("invalid x-api-key", "model_error")).toBe("ai");
    expect(errorKind("payout failed: fetch failed")).toBe("network");
    expect(errorKind("payout failed: 422 INSUFFICIENT_FUNDS")).toBe("paypal");
    expect(errorKind("not payable: over limit")).toBe("rules");
    expect(errorKind("something odd")).toBe("other");
  });
});

describe("failedPayouts", () => {
  it("lists a shift whose last pay attempt failed and has no payout row", () => {
    const log = [entry(1, "auto_pay", { ok: false, error: "payout failed: fetch failed" })];
    expect(failedPayouts(log, [], day)).toEqual([
      { obligationId: "s1", payeeName: "Maria", amountCents: 12000, error: "payout failed: fetch failed" },
    ]);
  });

  it("drops it once a later attempt succeeds or a payout row exists", () => {
    const failed = entry(1, "auto_pay", { ok: false, error: "payout failed: fetch failed" });
    expect(failedPayouts([failed, entry(2, "auto_pay", { ok: true })], [], day)).toEqual([]);
    const row = { shiftId: "s1", billId: null } as PayoutRow;
    expect(failedPayouts([failed], [row], day)).toEqual([]);
  });

  it("ignores refusals by the rules", () => {
    expect(failedPayouts([entry(1, "pay_obligation", { ok: false, error: "not payable: x" })], [], day)).toEqual([]);
  });
});

describe("summarySentences", () => {
  it("splits the code-built summary into a headline and facts", () => {
    expect(
      summarySentences(
        "Closed November 4. Paid 1 ($120.00 total): Maria $120.00. 1 needs your decision: Rosa $240.00 (Possible duplicate: a $240.00 bill). Nothing else.",
      ),
    ).toEqual([
      "Closed November 4.",
      "Paid 1 ($120.00 total): Maria $120.00.",
      "1 needs your decision: Rosa $240.00 (Possible duplicate: a $240.00 bill).",
      "Nothing else.",
    ]);
  });
});
