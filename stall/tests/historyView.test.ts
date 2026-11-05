import { describe, expect, it } from "vitest";
import { messagesFor } from "@/lib/i18n";
import {
  applyView,
  describeView,
  historySummary,
  historyViewSchema,
  rangeDates,
  totalsOf,
  type HistoryRow,
  type HistoryView,
} from "@/lib/historyView";

function sale(id: string, cents: number, method: "cash" | "paypal", items = "1× Taco al pastor"): HistoryRow {
  return {
    id,
    kind: "sale",
    date: "2026-11-04",
    at: `2026-11-04T1${id.length}:00:00.000Z`,
    who: null,
    items,
    method,
    status: method === "cash" ? "paid_cash" : "paid",
    inCents: cents,
    outCents: 0,
    taxCents: 0,
    tipCents: 0,
    invoiceNumber: `INV-${id}`,
  };
}

function payout(id: string, cents: number, who: string, status: HistoryRow["status"] = "SUCCESS"): HistoryRow {
  return {
    id,
    kind: "payout",
    date: "2026-11-04",
    at: "2026-11-05T02:00:00.000Z",
    who,
    items: "Shift",
    method: "payout",
    status,
    inCents: 0,
    outCents: cents,
    taxCents: 0,
    tipCents: 0,
    invoiceNumber: null,
  };
}

const rows: HistoryRow[] = [
  sale("a", 2450, "cash", "2× Taco al pastor, 1× Agua fresca"),
  sale("bb", 1800, "cash"),
  sale("ccc", 2170, "cash", "1× Elote"),
  sale("dddd", 900, "paypal"),
  payout("p1", 12000, "María"),
  payout("p2", 24000, "Tortillería Rosa", "FAILED"),
];

const view = (fields: Partial<HistoryView>): HistoryView => ({ range: "7d", answerHint: "", ...fields });

describe("historyViewSchema", () => {
  it("accepts a full view and turns nulls into absent fields", () => {
    const parsed = historyViewSchema.parse({
      range: "30d",
      kind: "payout",
      method: null,
      statuses: ["FAILED", "FAILED"],
      who: "  Maria ",
      minCents: 2000,
      maxCents: null,
      search: "",
      sort: { column: "outCents", direction: "desc" },
      answerHint: "Failed payouts to Maria.",
    });
    expect(parsed).toEqual({
      range: "30d",
      kind: "payout",
      statuses: ["FAILED"],
      who: "Maria",
      minCents: 2000,
      sort: { column: "outCents", direction: "desc" },
      answerHint: "Failed payouts to Maria.",
    });
  });

  it("swaps a minimum above the maximum", () => {
    const parsed = historyViewSchema.parse({ range: "7d", minCents: 5000, maxCents: 2000, answerHint: "" });
    expect([parsed.minCents, parsed.maxCents]).toEqual([2000, 5000]);
  });

  it("rejects anything outside the allowed view", () => {
    const bad = [
      { range: "year", answerHint: "" },
      { range: "7d", kind: "refund", answerHint: "" },
      { range: "7d", statuses: ["RETURNED_TO_SENDER"], answerHint: "" },
      { range: "7d", minCents: 12.5, answerHint: "" },
      { range: "7d", minCents: -100, answerHint: "" },
      { range: "7d", sort: { column: "secret", direction: "asc" }, answerHint: "" },
      { range: "7d", who: "x".repeat(61), answerHint: "" },
      { range: "7d" },
    ];
    for (const input of bad) expect(historyViewSchema.safeParse(input).success, JSON.stringify(input)).toBe(false);
  });
});

describe("applyView", () => {
  it("keeps cash sales over 20 dollars", () => {
    const kept = applyView(rows, view({ kind: "sale", method: "cash", minCents: 2000 }));
    expect(kept.map((row) => row.id)).toEqual(["a", "ccc"]);
  });

  it("matches a payee name without case or accents", () => {
    expect(applyView(rows, view({ who: "maria" })).map((row) => row.id)).toEqual(["p1"]);
    expect(applyView(rows, view({ who: "ROSA" })).map((row) => row.id)).toEqual(["p2"]);
  });

  it("filters by status and by an amount ceiling on payouts", () => {
    expect(applyView(rows, view({ statuses: ["FAILED"] })).map((row) => row.id)).toEqual(["p2"]);
    expect(applyView(rows, view({ kind: "payout", maxCents: 15000 })).map((row) => row.id)).toEqual(["p1"]);
  });

  it("searches items and invoice numbers", () => {
    expect(applyView(rows, view({ search: "agua" })).map((row) => row.id)).toEqual(["a"]);
    expect(applyView(rows, view({ search: "inv-dddd" })).map((row) => row.id)).toEqual(["dddd"]);
  });

  it("sorts when the view asks", () => {
    expect(applyView(rows, view({ kind: "sale", sort: { column: "inCents", direction: "desc" } })).map((r) => r.id)).toEqual([
      "a",
      "ccc",
      "bb",
      "dddd",
    ]);
    expect(applyView(rows, view({ kind: "sale", sort: { column: "at", direction: "asc" } })).map((r) => r.id)).toEqual([
      "a",
      "bb",
      "ccc",
      "dddd",
    ]);
  });

  it("keeps everything for an empty view, in the given order", () => {
    expect(applyView(rows, view({}))).toEqual(rows);
  });
});

describe("totalsOf", () => {
  it("counts a failed payout as a payout but not as money out", () => {
    expect(totalsOf(rows)).toEqual({ inCents: 7320, outCents: 12000, netCents: 7320 - 12000, sales: 4, payouts: 2 });
  });
});

describe("rangeDates", () => {
  it("covers today, the last 7 and the last 30 days inclusive", () => {
    expect(rangeDates("today", "2026-11-05")).toEqual({ from: "2026-11-05", to: "2026-11-05" });
    expect(rangeDates("7d", "2026-11-05")).toEqual({ from: "2026-10-30", to: "2026-11-05" });
    expect(rangeDates("30d", "2026-11-05")).toEqual({ from: "2026-10-07", to: "2026-11-05" });
  });
});

describe("historySummary", () => {
  const cashOver20 = applyView(rows, view({ kind: "sale", method: "cash", minCents: 2000 }));

  it("says how many cash sales and how much, in English", () => {
    expect(historySummary(cashOver20, "en")).toBe("2 cash sales, $46.20");
    expect(historySummary(cashOver20.slice(0, 1), "en")).toBe("1 cash sale, $24.50");
  });

  it("says it in Spanish", () => {
    expect(historySummary(cashOver20, "es")).toBe("2 ventas en efectivo, $46.20");
    expect(historySummary(applyView(rows, view({ who: "maria" })), "es")).toBe("1 pago, $120.00");
  });

  it("says it in Polish with the right plural forms", () => {
    expect(historySummary(cashOver20, "pl")).toBe("2 sprzedaże za gotówkę, $46.20");
    const five = Array.from({ length: 5 }, (_, i) => sale(`s${i}`, 100, "paypal"));
    expect(historySummary(five, "pl")).toBe("5 sprzedaży przez PayPal, $5.00");
    expect(historySummary(applyView(rows, view({ statuses: ["FAILED"] })), "pl")).toBe(
      "1 nieudana wypłata (nie wysłano $240.00)",
    );
  });

  it("adds payouts, failures and the net when both kinds are shown", () => {
    expect(historySummary(rows, "en")).toBe(
      "4 sales, $73.20 · 1 payout, $120.00 · 1 failed payout ($240.00 not sent) · net -$46.80",
    );
  });

  it("says nothing matches for no rows", () => {
    expect(historySummary([], "en")).toBe("Nothing matches.");
    expect(historySummary([], "es")).toBe("Nada coincide.");
    expect(historySummary([], "pl")).toBe("Nic nie pasuje.");
  });
});

describe("describeView", () => {
  it("lists the view's conditions in the owner's language", () => {
    const v = view({ kind: "sale", method: "cash", minCents: 2000, sort: { column: "inCents", direction: "desc" } });
    expect(describeView(v, messagesFor("en"))).toEqual(["7 days", "Sales", "Cash", "$20.00 or more", "In, highest first"]);
    expect(describeView(view({ range: "30d", statuses: ["FAILED"] }), messagesFor("pl"))).toEqual(["30 dni", "Błąd"]);
  });
});
