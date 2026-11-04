import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { bills, decisions, payouts, shifts } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb } from "@/db/test-db";
import { businessDate } from "@/lib/dates";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(holder.db as object, prop) }),
}));

// Only the PayPal network call and the model are faked; rules, agent and DB are real.
const paypal = vi.hoisted(() => ({ createPayout: vi.fn() }));
vi.mock("@/lib/paypal/payouts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paypal/payouts")>()),
  ...paypal,
}));

vi.mock("@/lib/ai/model", () => ({
  getModel: () =>
    new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text" as const, text: "done" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }),
    }),
}));

const parser = vi.hoisted(() => ({ parseObligation: vi.fn() }));
vi.mock("@/lib/parse/parseObligation", () => parser);

import { POST as shiftPost, DELETE as shiftDelete } from "@/app/api/shifts/route";
import { POST as billPost } from "@/app/api/bills/route";
import { POST as parsePost } from "@/app/api/obligations/parse/route";
import { GET as closeGetRoute, POST as closePost } from "@/app/api/close/route";
import { GET as closeGet } from "@/app/api/close/[date]/route";
import { POST as decisionPost } from "@/app/api/decisions/[id]/route";
import { GET as dayGet } from "@/app/api/day/[date]/route";
import { ownerCookieValue } from "@/lib/auth";

const KEY = "close-key-for-tests";
let owner: string;
let db: Db;
let close: () => Promise<void>;
let mariaId: string;
let rosaId: string;
const today = businessDate(new Date(), "America/Chicago");

function req(method: string, url: string, body?: unknown, cookie: string | null = owner): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: `stall_owner=${cookie}` } : {}),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const dateCtx = (date: string) => ({ params: Promise.resolve({ date }) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("OWNER_PIN", "1234");
  vi.stubEnv("CLOSE_TRIGGER_KEY", KEY);
  owner = ownerCookieValue();

  const test = await createTestDb();
  db = test.db;
  holder.db = db;
  close = test.close;
  const seeded = await seed(db);
  mariaId = seeded.payees.maria;
  rosaId = seeded.payees.rosa;
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await close();
});

describe("auth", () => {
  it("every owner route is 401 without the cookie, and with a wrong cookie", async () => {
    const calls = [
      () => shiftPost(req("POST", "/api/shifts", { payeeId: mariaId }, null)),
      () => shiftDelete(req("DELETE", `/api/shifts?payeeId=${mariaId}&date=${today}`, undefined, null)),
      () => billPost(req("POST", "/api/bills", {}, null)),
      () => parsePost(req("POST", "/api/obligations/parse", {}, null)),
      () => closeGet(req("GET", `/api/close/${today}`, undefined, null), dateCtx(today)),
      () => decisionPost(req("POST", "/api/decisions/x", {}, null), idCtx("x")),
      () => dayGet(req("GET", `/api/day/${today}`, undefined, null), dateCtx(today)),
      () => dayGet(req("GET", `/api/day/${today}`, undefined, "deadbeef"), dateCtx(today)),
    ];
    for (const call of calls) {
      const res = await call();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("POST /api/close without cookie or key is 401 and a wrong key is 401", async () => {
    expect((await closePost(req("POST", "/api/close", {}, null))).status).toBe(401);
    expect((await closePost(req("POST", "/api/close?key=nope", {}, null))).status).toBe(401);
    expect((await closePost(req("POST", "/api/close?key=", {}, null))).status).toBe(401);
    expect(paypal.createPayout).not.toHaveBeenCalled();
  });
});

describe("shifts and bills", () => {
  it("POST /api/shifts is idempotent and DELETE removes it", async () => {
    const a = await shiftPost(req("POST", "/api/shifts", { payeeId: mariaId, date: "2031-06-01" }));
    const b = await shiftPost(req("POST", "/api/shifts", { payeeId: mariaId, date: "2031-06-01" }));
    expect(a.status).toBe(200);
    const sa = (await a.json()) as { id: string };
    expect(((await b.json()) as { id: string }).id).toBe(sa.id);
    expect(await db.select().from(shifts).where(eq(shifts.date, "2031-06-01"))).toHaveLength(1);

    const del = await shiftDelete(req("DELETE", `/api/shifts?payeeId=${mariaId}&date=2031-06-01`));
    expect(del.status).toBe(200);
    expect(await db.select().from(shifts).where(eq(shifts.date, "2031-06-01"))).toHaveLength(0);
    const gone = await shiftDelete(req("DELETE", `/api/shifts?payeeId=${mariaId}&date=2031-06-01`));
    expect(gone.status).toBe(404);
  });

  it("POST /api/shifts defaults the date to today's business date", async () => {
    // Maria's seeded shift for today already exists, so this is also an idempotent no-op.
    const res = await shiftPost(req("POST", "/api/shifts", { payeeId: mariaId }));
    expect(((await res.json()) as { date: string }).date).toBe(today);
    expect(await db.select().from(shifts).where(eq(shifts.date, today))).toHaveLength(1);
  });

  it("DELETE /api/shifts is 409 once a payout exists", async () => {
    const created = (await (
      await shiftPost(req("POST", "/api/shifts", { payeeId: mariaId, date: "2031-06-02" }))
    ).json()) as { id: string };
    await db.insert(payouts).values({
      businessId: (await db.select().from(shifts).where(eq(shifts.id, created.id)))[0]!.businessId,
      shiftId: created.id,
      batchId: `route-test-${created.id}`,
      amountCents: 12000,
      rationale: "t",
      createdAt: new Date("2031-06-02T12:00:00Z"),
    });
    const res = await shiftDelete(req("DELETE", `/api/shifts?payeeId=${mariaId}&date=2031-06-02`));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "has_payout" });
  });

  it("validates bodies and payee ids", async () => {
    expect((await shiftPost(req("POST", "/api/shifts", { payeeId: "nope" }))).status).toBe(400);
    expect((await shiftPost(req("POST", "/api/shifts", "{bad"))).status).toBe(400);
    expect(
      (await shiftPost(req("POST", "/api/shifts", { payeeId: mariaId, date: "2031-13-45" }))).status,
    ).toBe(400);
    const missing = await shiftPost(
      req("POST", "/api/shifts", { payeeId: "00000000-0000-4000-8000-000000000000" }),
    );
    expect(missing.status).toBe(404);
    expect((await shiftDelete(req("DELETE", "/api/shifts?payeeId=x"))).status).toBe(400);

    const base = { payeeId: rosaId, note: "ok" };
    expect((await billPost(req("POST", "/api/bills", { ...base, amountCents: 0 }))).status).toBe(400);
    expect((await billPost(req("POST", "/api/bills", { ...base, amountCents: 1.5 }))).status).toBe(400);
    expect(
      (await billPost(req("POST", "/api/bills", { ...base, amountCents: 100, note: "n".repeat(141) })))
        .status,
    ).toBe(400);
  });

  it("POST /api/bills stores an open bill dated today by default", async () => {
    const res = await billPost(
      req("POST", "/api/bills", { payeeId: rosaId, amountCents: 5000, note: "limes", photoUrl: "https://x.test/a.jpg" }),
    );
    expect(res.status).toBe(200);
    const bill = (await res.json()) as { id: string };
    const [row] = await db.select().from(bills).where(eq(bills.id, bill.id));
    expect(row).toMatchObject({
      amountCents: 5000,
      note: "limes",
      date: today,
      status: "open",
      photoUrl: "https://x.test/a.jpg",
    });
  });
});

describe("obligation parse", () => {
  it("passes the transcript and the business payees to the parser", async () => {
    parser.parseObligation.mockResolvedValueOnce({ kind: "shift", payeeId: mariaId });
    const res = await parsePost(
      req("POST", "/api/obligations/parse", { transcript: "Maria worked today", language: "en" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "shift", payeeId: mariaId });
    const arg = parser.parseObligation.mock.calls[0]![0] as {
      transcript: string;
      payees: { id: string; name: string }[];
    };
    expect(arg.transcript).toBe("Maria worked today");
    expect(arg.payees.map((p) => p.name).sort()).toEqual(["Maria", "Tortillería Rosa"]);
  });

  it("is 400 for a bad body and 422 when the parser fails", async () => {
    expect((await parsePost(req("POST", "/api/obligations/parse", { language: "en" }))).status).toBe(400);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    parser.parseObligation.mockRejectedValueOnce(new Error("model down"));
    const res = await parsePost(
      req("POST", "/api/obligations/parse", { transcript: "hi", language: "en" }),
    );
    spy.mockRestore();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "parse_failed" });
  });
});

describe("close, decisions and day", () => {
  it("closes the day with the trigger key, then serves the run, decisions and day view", async () => {
    paypal.createPayout.mockImplementation(async (input: { batchId: string }) => ({
      batchId: input.batchId,
      paypalBatchId: "PB-ROUTE",
      status: "PENDING",
    }));
    const res = await closePost(req("POST", `/api/close?key=${KEY}`, undefined, null));
    expect(res.status).toBe(200);
    const result = (await res.json()) as {
      summary: string;
      paid: { batchId: string }[];
      held: { decisionId: string }[];
    };

    expect(result.paid).toHaveLength(1);
    expect(result.paid[0]!.batchId).toMatch(/^st-s-[0-9a-f]{25}$/);
    expect(result.held).toHaveLength(2);
    expect(paypal.createPayout).toHaveBeenCalledTimes(1);

    const view = (await (await closeGet(req("GET", `/api/close/${today}`), dateCtx(today))).json()) as {
      run: { summary: string } | null;
      decisions: { id: string; status: string }[];
      payouts: { batchId: string; payeeName: string | null; payeeRole: string | null }[];
    };
    expect(view.run?.summary).toBe(result.summary);
    expect(view.decisions.map((d) => d.id).sort()).toEqual(
      result.held.map((h) => h.decisionId).sort(),
    );
    // Payouts made on that business day, including the seed's own earlier payout row.
    expect(view.payouts.map((p) => p.batchId)).toContain(result.paid[0]!.batchId);
    // Each payout names its payee through its shift or bill, even when that bill is from an earlier day.
    expect(view.payouts.map((p) => p.payeeName)).toContain("Tortillería Rosa");
    const rosaPayout = view.payouts.find((p) => p.payeeName === "Tortillería Rosa")!;
    expect(rosaPayout.payeeRole).toBe("supplier");
    expect(view.payouts.find((p) => p.batchId === result.paid[0]!.batchId)!.payeeName).toBe("Maria");

    const empty = (await (await closeGet(req("GET", "/api/close/2031-01-01"), dateCtx("2031-01-01"))).json()) as {
      run: unknown;
      decisions: unknown[];
    };
    expect(empty).toEqual({ run: null, decisions: [], payouts: [] });

    const day = (await (await dayGet(req("GET", `/api/day/${today}`), dateCtx(today))).json()) as {
      shifts: { payee: { name: string } }[];
      bills: { payee: { name: string } }[];
      payouts: unknown[];
      decisions: unknown[];
      totals: Record<string, number>;
    };
    expect(day.shifts.map((s) => s.payee.name)).toEqual(["Maria"]);
    expect((day.payouts as { batchId: string }[]).map((p) => p.batchId)).toContain(
      result.paid[0]!.batchId,
    );
    expect((day.payouts as { payeeName: string | null }[]).map((p) => p.payeeName)).toContain("Tortillería Rosa");
    expect(day.decisions).toHaveLength(2);
    expect(day.bills.length).toBeGreaterThan(0);
    expect(day.totals).toHaveProperty("cashCents");

    // Running again for the same day pays nothing more.
    const again = await closePost(req("POST", "/api/close", {}));
    expect(again.status).toBe(200);
    expect(paypal.createPayout).toHaveBeenCalledTimes(1);
  });

  it("approve with a stale amount is 409 amount_changed and sends nothing", async () => {
    const [decision] = await db.select().from(decisions).where(eq(decisions.status, "open"));
    paypal.createPayout.mockClear();
    const res = await decisionPost(
      req("POST", `/api/decisions/${decision!.id}`, { action: "approve", expectedCents: 1 }),
      idCtx(decision!.id),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "amount_changed" });
    expect(paypal.createPayout).not.toHaveBeenCalled();
    expect((await db.select().from(decisions).where(eq(decisions.id, decision!.id)))[0]!.status).toBe("open");
  });

  it("owner can resolve the held decision; a second action is 409", async () => {
    const [decision] = await db.select().from(decisions).where(eq(decisions.status, "open"));
    const bad = await decisionPost(req("POST", `/api/decisions/${decision!.id}`, { action: "nuke" }), idCtx(decision!.id));
    expect(bad.status).toBe(400);

    paypal.createPayout.mockClear();
    const res = await decisionPost(
      req("POST", `/api/decisions/${decision!.id}`, { action: "mark_paid" }),
      idCtx(decision!.id),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { decision: { status: string } }).decision.status).toBe("marked_paid");
    expect(paypal.createPayout).not.toHaveBeenCalled();

    const second = await decisionPost(
      req("POST", `/api/decisions/${decision!.id}`, { action: "approve" }),
      idCtx(decision!.id),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "already_resolved" });

    const unknown = await decisionPost(
      req("POST", "/api/decisions/junk", { action: "decline" }),
      idCtx("junk"),
    );
    expect(unknown.status).toBe(404);
  });

  it("rejects malformed dates", async () => {
    expect((await dayGet(req("GET", "/api/day/yesterday"), dateCtx("yesterday"))).status).toBe(400);
    expect((await closeGet(req("GET", "/api/close/2031-02-30"), dateCtx("2031-02-30"))).status).toBe(400);
    expect((await closePost(req("POST", "/api/close", { date: "soon" }))).status).toBe(400);
  });

  it("refuses to close a future date, so it cannot reset the per-day caps", async () => {
    paypal.createPayout.mockClear();
    const res = await closePost(req("POST", "/api/close", { date: "2099-01-01" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "future_date" });
    expect(paypal.createPayout).not.toHaveBeenCalled();
  });
});

describe("close with a bearer token", () => {
  const bearer = (token: string, method = "POST") =>
    new Request("http://localhost/api/close", {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });

  it("rejects a wrong bearer and a non-bearer scheme with 401", async () => {
    expect((await closePost(bearer("wrong"))).status).toBe(401);
    expect((await closeGetRoute(bearer("wrong", "GET"))).status).toBe(401);
    const basic = new Request("http://localhost/api/close", {
      method: "POST",
      headers: { Authorization: `Basic ${KEY}` },
    });
    expect((await closePost(basic)).status).toBe(401);
    expect(paypal.createPayout).not.toHaveBeenCalled();
  });

  it("accepts CLOSE_TRIGGER_KEY as the bearer when CRON_SECRET is unset", async () => {
    expect((await closePost(bearer(KEY))).status).toBe(200);
  });

  it("uses CRON_SECRET when set, and then rejects the trigger key as a bearer", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
    try {
      expect((await closePost(bearer(KEY))).status).toBe(401);
      // Authorised: closing today again is a safe no-op.
      expect((await closeGetRoute(bearer("cron-secret-for-tests", "GET"))).status).toBe(200);
    } finally {
      vi.stubEnv("CRON_SECRET", "");
    }
  });
});
