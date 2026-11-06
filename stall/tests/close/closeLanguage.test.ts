import { describe, expect, it } from "vitest";
import type { Payee } from "@/db/schema";
import { buildClosePrompt } from "@/lib/close/agent";
import { evaluateObligations, type Obligation, type RuleOutcome } from "@/lib/close/rules";
import { deterministicSummary } from "@/lib/close/runClose";
import { closeMessages } from "@/lib/i18n/close";
import { LANGUAGES, type Language } from "@/lib/parse/schema";

const TODAY = "2026-11-04";

function payee(overrides: Partial<Payee>): Payee {
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

const maria = payee({ id: "payee-maria", name: "Maria" });
const rosa = payee({
  id: "payee-rosa",
  name: "Tortillería Rosa",
  role: "supplier",
  dailyRateCents: null,
  maxPerDayCents: 20000,
  autoPay: false,
});
const luis = payee({ id: "payee-luis", name: "Luis", dailyRateCents: 9000, maxPerDayCents: 5000 });

const obligations: Obligation[] = [
  { kind: "shift", id: "shift-maria", payee: maria, amountCents: 12000, date: TODAY },
  { kind: "bill", id: "bill-rosa", payee: rosa, amountCents: 24000, note: "tortillas", date: TODAY },
  { kind: "shift", id: "shift-luis", payee: luis, amountCents: 9000, date: TODAY },
];

const evaluate = (language?: Language) =>
  evaluateObligations({
    date: TODAY,
    obligations,
    existingPayouts: [],
    paidBills: [
      {
        id: "bill-paid",
        payeeId: rosa.id,
        amountCents: 24000,
        note: "tortillas",
        date: "2026-11-02",
        payoutBatchId: "st-b-0000000000000000000000000",
      },
    ],
    paidTodayByPayee: {},
    businessDailyCapCents: 100000,
    ...(language ? { language } : {}),
  });

describe("rules engine reasons in the owner's language", () => {
  it("never changes a verdict, a decision type or the evidence", () => {
    const strip = (o: RuleOutcome) => ({ ...o, reason: undefined });
    const english = evaluate().map(strip);
    for (const language of LANGUAGES) expect(evaluate(language).map(strip)).toEqual(english);
    expect(english.map((o) => o.verdict)).toEqual(["pay", "hold", "hold"]);
  });

  it("defaults to English", () => {
    expect(evaluate().map((o) => o.reason)).toEqual(evaluate("en").map((o) => o.reason));
    expect(evaluate()[1]!.reason).toBe(
      "Possible duplicate: a $240.00 bill for Tortillería Rosa was already paid on November 2.",
    );
  });

  it("writes Spanish reasons from the same facts", () => {
    const [shift, duplicate, over] = evaluate("es").map((o) => o.reason);
    expect(shift).toBe("Turno anotado hoy; $120.00 dentro del límite diario de Maria.");
    expect(duplicate).toBe(
      "Posible duplicado: ya se pagó una cuenta de $240.00 a Tortillería Rosa el 2 de noviembre.",
    );
    expect(over).toBe("$90.00 pasa lo que le queda hoy a Luis, que es $50.00 (límite diario $50.00).");
  });

  it("writes Polish reasons from the same facts", () => {
    const [shift, duplicate, over] = evaluate("pl").map((o) => o.reason);
    expect(shift).toBe("Zmiana zapisana dziś; $120.00 mieści się w dziennym limicie odbiorcy Maria.");
    expect(duplicate).toBe(
      "Możliwy duplikat: rachunek na $240.00 (Tortillería Rosa) został już zapłacony 2 listopada.",
    );
    expect(over).toContain("$90.00");
    expect(over).toContain("$50.00");
    expect(over).toContain("Luis");
  });

  it("words every other hold reason in each language", () => {
    for (const language of ["es", "pl"] as const) {
      const r = closeMessages(language).reasons;
      const en = closeMessages("en").reasons;
      expect(r.notAutoPay("Rosa")).not.toBe(en.notAutoPay("Rosa"));
      expect(r.previousPayout("FAILED")).not.toContain("FAILED");
      expect(r.previousPayout("FAILED")).not.toBe(en.previousPayout("FAILED"));
      expect(r.overBusinessCap("$10.00", "$1,000.00")).toContain("$1,000.00");
      expect(r.alreadyEscalated).not.toBe(en.alreadyEscalated);
    }
  });
});

describe("deterministicSummary in the owner's language", () => {
  // One paid (Maria), one held (Rosa), nothing failed.
  function stateFor(language: Language) {
    const outcomes = evaluate(language);
    const [paid, held] = outcomes;
    return {
      outcomes: new Map(outcomes.map((o) => [o.obligation.id, o])),
      paid: new Map([[paid!.obligation.id, { obligationId: paid!.obligation.id, batchId: "b1", cents: 12000 }]]),
      held: new Map([[held!.obligation.id, { decisionId: "d1", reason: held!.reason }]]),
    };
  }

  it("is unchanged in English", () => {
    expect(deterministicSummary(TODAY, stateFor("en"), [], 2)).toBe(
      "Closed November 4. Paid 1 ($120.00 total): Maria $120.00. " +
        "1 needs your decision: Tortillería Rosa $240.00 (Possible duplicate: a $240.00 bill for Tortillería Rosa was already paid on November 2). " +
        "2 already handled.",
    );
  });

  it("speaks Spanish", () => {
    const outcomes = evaluate("es");
    expect(deterministicSummary(TODAY, stateFor("es"), [outcomes[2]!], 1, "es")).toBe(
      "Cierre del 4 de noviembre. Se pagó 1 (total $120.00): Maria $120.00. " +
        "1 espera tu decisión: Tortillería Rosa $240.00 (Posible duplicado: ya se pagó una cuenta de $240.00 a Tortillería Rosa el 2 de noviembre). " +
        "1 no se pudo pagar y se volverá a intentar: Luis $90.00. " +
        "1 ya estaba resuelto.",
    );
  });

  it("speaks Polish with proper plurals", () => {
    const summary = deterministicSummary(TODAY, stateFor("pl"), [], 5, "pl");
    expect(summary).toBe(
      "Zamknięto dzień 4 listopada. Wypłacono 1 pozycję (razem $120.00): Maria $120.00. " +
        "1 pozycja czeka na twoją decyzję: Tortillería Rosa $240.00 (Możliwy duplikat: rachunek na $240.00 (Tortillería Rosa) został już zapłacony 2 listopada). " +
        "5 pozycji było już załatwionych.",
    );
    const m = closeMessages("pl").summary;
    expect(m.paid(2, "$1.00", "x")).toContain("Wypłacono 2 pozycje");
    expect(m.paid(5, "$1.00", "x")).toContain("Wypłacono 5 pozycji");
    expect(m.needDecision(3, "x")).toBe("3 pozycje czekają na twoją decyzję: x.");
    expect(m.skipped(2)).toBe("2 pozycje były już załatwione.");
  });

  it("says there is nothing to pay in each language", () => {
    const empty = { outcomes: new Map(), paid: new Map(), held: new Map() };
    expect(deterministicSummary(TODAY, empty, [], 0)).toBe("Closed November 4. Nothing to pay today.");
    expect(deterministicSummary(TODAY, empty, [], 0, "es")).toBe("Cierre del 4 de noviembre. Hoy no hay nada que pagar.");
    expect(deterministicSummary(TODAY, empty, [], 0, "pl")).toBe(
      "Zamknięto dzień 4 listopada. Dziś nie ma nic do wypłacenia.",
    );
  });
});

describe("close prompt language", () => {
  const ctx = { date: TODAY, businessName: "La Esquina", sales: { count: 0, totalCents: 0 }, outcomes: [] };

  it("tells the agent to write its note and rationales in the owner's language", () => {
    expect(buildClosePrompt(ctx)).toMatch(/write_summary text in English/);
    expect(buildClosePrompt({ ...ctx, language: "pl" })).toMatch(
      /Write every rationale and the write_summary text in Polish/,
    );
    expect(buildClosePrompt({ ...ctx, language: "es" })).toMatch(/text in Spanish/);
  });
});
