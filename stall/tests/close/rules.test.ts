import { describe, expect, it } from "vitest";
import type { Payee } from "@/db/schema";
import {
  evaluateObligations,
  findDuplicateBill,
  type Obligation,
  type PaidBill,
} from "@/lib/close/rules";

const TODAY = "2026-11-04";

function makePayee(overrides: Partial<Payee> = {}): Payee {
  return {
    id: "payee-x",
    businessId: "biz-1",
    name: "Payee",
    email: "payee@example.com",
    role: "helper",
    dailyRateCents: 12000,
    maxPerDayCents: 15000,
    autoPay: true,
    enabled: true,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
  };
}

const maria = makePayee({
  id: "payee-maria",
  name: "Maria",
  role: "helper",
  dailyRateCents: 12000,
  maxPerDayCents: 15000,
  autoPay: true,
});

const rosa = makePayee({
  id: "payee-rosa",
  name: "Rosa",
  role: "supplier",
  dailyRateCents: null,
  maxPerDayCents: 20000,
  autoPay: false,
});

function shift(payee: Payee, id = `shift-${payee.id}`): Obligation {
  return { kind: "shift", id, payee, amountCents: payee.dailyRateCents ?? 0, date: TODAY };
}

function bill(
  payee: Payee,
  amountCents: number,
  note: string,
  id = "bill-open-1",
  date = TODAY,
): Obligation {
  return { kind: "bill", id, payee, amountCents, note, date };
}

// Seed demo day: Rosa's tortillas bill was already paid two days ago.
const paidTortillas: PaidBill = {
  id: "bill-paid-1",
  payeeId: rosa.id,
  amountCents: 24000,
  note: "tortillas",
  date: "2026-11-02",
  payoutBatchId: "st-b-a1b2c3d4e5f60718293a4b5c6",
};

function baseInput() {
  return {
    date: TODAY,
    obligations: [shift(maria), bill(rosa, 24000, "tortillas")],
    existingPayouts: [] as { shiftId?: string; billId?: string; status: string }[],
    paidBills: [paidTortillas],
    paidTodayByPayee: {} as Record<string, number>,
    businessDailyCapCents: 100000,
  };
}

describe("evaluateObligations", () => {
  it("pays Maria's shift and holds Rosa's open bill as a duplicate on the seed demo day", () => {
    const [mariaOutcome, rosaOutcome] = evaluateObligations(baseInput());

    expect(mariaOutcome?.verdict).toBe("pay");
    expect(mariaOutcome?.reason).toMatch(/shift/i);
    expect(mariaOutcome?.decisionType).toBeUndefined();

    expect(rosaOutcome?.verdict).toBe("hold");
    expect(rosaOutcome?.decisionType).toBe("duplicate_bill");
    expect(rosaOutcome?.evidence).toEqual({
      paidBillId: "bill-paid-1",
      payoutBatchId: "st-b-a1b2c3d4e5f60718293a4b5c6",
      amountCents: 24000,
      note: "tortillas",
      date: "2026-11-02",
    });
    expect(rosaOutcome?.reason).toContain("November 2");
    expect(rosaOutcome?.reason).toContain("$240.00");
  });

  it("skips a shift that already has a PENDING payout", () => {
    const input = baseInput();
    input.existingPayouts = [{ shiftId: `shift-${maria.id}`, status: "PENDING" }];

    const [mariaOutcome] = evaluateObligations(input);

    expect(mariaOutcome?.verdict).toBe("skip");
    expect(mariaOutcome?.reason).toMatch(/already/i);
  });

  it("skips a bill that already has a SUCCESS payout", () => {
    const input = baseInput();
    input.obligations = [bill(rosa, 30000, "limes")];
    input.paidBills = [];
    input.existingPayouts = [{ billId: "bill-open-1", status: "SUCCESS" }];

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("skip");
  });

  it("holds as escalated when the existing payout is FAILED, instead of paying again", () => {
    const input = baseInput();
    input.existingPayouts = [{ shiftId: `shift-${maria.id}`, status: "FAILED" }];

    const [mariaOutcome] = evaluateObligations(input);

    expect(mariaOutcome?.verdict).toBe("hold");
    expect(mariaOutcome?.decisionType).toBe("escalated");
    expect(mariaOutcome?.reason).toBe("previous payout FAILED; check before paying again");
  });

  it("holds over_limit when the shift exceeds the payee's max per day", () => {
    const tightMaria = makePayee({ ...maria, maxPerDayCents: 10000 });
    const input = baseInput();
    input.obligations = [shift(tightMaria)];
    input.paidBills = [];

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("hold");
    expect(outcome?.decisionType).toBe("over_limit");
  });

  it("counts money already paid today against the payee's max per day", () => {
    const input = baseInput();
    input.obligations = [shift(maria)];
    input.paidBills = [];
    input.paidTodayByPayee = { [maria.id]: 5000 };

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("hold");
    expect(outcome?.decisionType).toBe("over_limit");
  });

  it("holds manual_payee when the payee has auto_pay off and there is no duplicate", () => {
    const input = baseInput();
    input.obligations = [bill(rosa, 15000, "limes")];
    input.paidBills = [];

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("hold");
    expect(outcome?.decisionType).toBe("manual_payee");
  });

  it("holds manual_payee for a disabled payee", () => {
    const disabledMaria = makePayee({ ...maria, enabled: false });
    const input = baseInput();
    input.obligations = [shift(disabledMaria)];
    input.paidBills = [];

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("hold");
    expect(outcome?.decisionType).toBe("manual_payee");
  });

  it("holds a shift with no daily rate configured as over_limit", () => {
    const noRateMaria = makePayee({ ...maria, dailyRateCents: null });
    const input = baseInput();
    input.obligations = [shift(noRateMaria)];
    input.paidBills = [];

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("hold");
    expect(outcome?.decisionType).toBe("over_limit");
    expect(outcome?.reason).toBe(
      "Maria has no daily rate set; add one in Settings before this shift can be paid.",
    );
  });

  it("holds the second shift over_limit when the business daily cap would be exceeded", () => {
    const helperA = makePayee({
      id: "payee-a",
      name: "Ana",
      dailyRateCents: 8000,
      maxPerDayCents: 15000,
    });
    const helperB = makePayee({
      id: "payee-b",
      name: "Ben",
      dailyRateCents: 8000,
      maxPerDayCents: 15000,
    });
    const input = baseInput();
    input.obligations = [shift(helperA), shift(helperB)];
    input.paidBills = [];
    input.businessDailyCapCents = 10000;

    const [first, second] = evaluateObligations(input);

    expect(first?.verdict).toBe("pay");
    expect(second?.verdict).toBe("hold");
    expect(second?.decisionType).toBe("over_limit");
  });

  it("treats a bill as duplicate when the normalized note matches, even with a different amount", () => {
    const input = baseInput();
    input.obligations = [bill(rosa, 30000, "Tortillas ")];

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("hold");
    expect(outcome?.decisionType).toBe("duplicate_bill");
    expect(outcome?.evidence?.paidBillId).toBe("bill-paid-1");
  });

  it("holds a second same-payee auto-pay obligation that exceeds the remaining daily allowance", () => {
    const input = baseInput();
    input.obligations = [shift(maria), bill(maria, 12000, "limes")];
    input.paidBills = [];

    const [first, second] = evaluateObligations(input);

    expect(first?.verdict).toBe("pay");
    expect(second?.verdict).toBe("hold");
    expect(second?.decisionType).toBe("over_limit");
    expect(second?.reason).toContain("$30.00");
  });

  it("counts money already paid today toward the business cap", () => {
    const helper = makePayee({
      id: "payee-ana",
      name: "Ana",
      dailyRateCents: 8000,
      maxPerDayCents: 15000,
    });
    const input = baseInput();
    input.obligations = [shift(helper)];
    input.paidBills = [];
    input.paidTodayByPayee = { "payee-other": 15000 };
    input.businessDailyCapCents = 20000;

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("hold");
    expect(outcome?.decisionType).toBe("over_limit");
  });

  it.each([0, -500])("holds a bill with invalid amount %i as over_limit", (amountCents) => {
    const input = baseInput();
    input.obligations = [bill(maria, amountCents, "limes")];
    input.paidBills = [];

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("hold");
    expect(outcome?.decisionType).toBe("over_limit");
    expect(outcome?.reason).toContain("invalid amount");
  });

  it("holds a shift whose daily rate is negative as an invalid amount", () => {
    const negativeMaria = makePayee({ ...maria, dailyRateCents: -500 });
    const input = baseInput();
    input.obligations = [shift(negativeMaria)];
    input.paidBills = [];

    const [outcome] = evaluateObligations(input);

    expect(outcome?.verdict).toBe("hold");
    expect(outcome?.reason).toContain("invalid amount");
  });
});

describe("findDuplicateBill", () => {
  it("ignores a paid bill with the same id as the evaluated bill", () => {
    const self: PaidBill = { ...paidTortillas, id: "bill-open-1" };

    expect(findDuplicateBill(bill(rosa, 24000, "tortillas"), [self], TODAY)).toBeUndefined();
  });

  it("ignores a paid bill dated after today", () => {
    const future: PaidBill = { ...paidTortillas, date: "2026-11-05" };

    expect(findDuplicateBill(bill(rosa, 24000, "tortillas"), [future], TODAY)).toBeUndefined();
  });

  it("matches an amount within 10% for the same payee within 7 days", () => {
    const candidate = bill(rosa, 25000, "limes");

    expect(findDuplicateBill(candidate, [paidTortillas], TODAY)).toEqual(paidTortillas);
  });

  it("does not match an amount beyond 10% with a different note", () => {
    const candidate = bill(rosa, 30000, "limes");

    expect(findDuplicateBill(candidate, [paidTortillas], TODAY)).toBeUndefined();
  });

  it("does not match a paid bill older than 7 days", () => {
    const oldPaid: PaidBill = { ...paidTortillas, date: "2026-10-27" };
    const candidate = bill(rosa, 24000, "tortillas");

    expect(findDuplicateBill(candidate, [oldPaid], TODAY)).toBeUndefined();
  });

  it("matches a paid bill exactly 7 days old (inclusive window)", () => {
    const edgePaid: PaidBill = { ...paidTortillas, date: "2026-10-28" };
    const candidate = bill(rosa, 24000, "tortillas");

    expect(findDuplicateBill(candidate, [edgePaid], TODAY)).toEqual(edgePaid);
  });

  it("ignores paid bills belonging to a different payee", () => {
    const candidate = bill(maria, 24000, "tortillas");

    expect(findDuplicateBill(candidate, [paidTortillas], TODAY)).toBeUndefined();
  });
});
