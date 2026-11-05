import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(holder.db as object, prop) }),
}));

// The model is the only fake: each test sets what it answers and reads what it was sent.
const model = vi.hoisted(() => ({ text: "", prompts: [] as unknown[] }));
vi.mock("@/lib/ai/model", () => ({
  getModel: () =>
    new MockLanguageModelV4({
      doGenerate: async (options) => {
        model.prompts.push(options.prompt);
        return {
          content: [{ type: "text" as const, text: model.text }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        };
      },
    }),
}));

import { POST } from "@/app/api/history/ask/route";
import { ownerCookieValue } from "@/lib/auth";

function request(body: unknown, owner = true): Request {
  return new Request("http://localhost/api/history/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(owner ? { Cookie: `stall_owner=${ownerCookieValue()}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/history/ask", () => {
  let close: () => Promise<void>;

  beforeAll(async () => {
    const test = await createTestDb();
    holder.db = test.db;
    close = test.close;
    await seed(test.db);
    vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OWNER_PIN", "1234");
    vi.stubEnv("CLOSE_TRIGGER_KEY", "close-key-for-tests");
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    model.prompts = [];
  });

  it("returns the view the model described", async () => {
    model.text = JSON.stringify({
      range: "7d",
      kind: "sale",
      method: "cash",
      minCents: 2000,
      answerHint: "Cash sales over twenty dollars this week.",
    });
    const response = await POST(request({ question: "cash sales over 20 dollars this week", language: "en" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      view: {
        range: "7d",
        kind: "sale",
        method: "cash",
        minCents: 2000,
        answerHint: "Cash sales over twenty dollars this week.",
      },
    });
  });

  it("sends the question inside tags, the language and the seeded payees", async () => {
    model.text = JSON.stringify({ range: "30d", kind: "payout", who: "Maria", answerHint: "Pagos a Maria." });
    const response = await POST(request({ question: "¿cuánto le pagué a Maria?", language: "es" }));

    expect(response.status).toBe(200);
    const sent = JSON.stringify(model.prompts[0]);
    expect(sent).toContain("<question>\\n¿cuánto le pagué a Maria?\\n</question>");
    expect(sent).toContain("The owner speaks Spanish");
    expect(sent).toContain("- Maria\\n- Tortillería Rosa");
  });

  it("answers 422 parse_failed when the model output is not an allowed view", async () => {
    model.text = JSON.stringify({ range: "7d", sort: { column: "password", direction: "asc" }, answerHint: "" });
    const response = await POST(request({ question: "show me everything", language: "en" }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "parse_failed" });
  });

  it("rejects an empty, too long or malformed question without calling the model", async () => {
    expect((await POST(request({ question: "  ", language: "en" }))).status).toBe(400);
    expect((await POST(request({ question: "x".repeat(301), language: "en" }))).status).toBe(400);
    expect((await POST(request({ question: "hola", language: "fr" }))).status).toBe(400);
    expect((await POST(request("{not json"))).status).toBe(400);
    expect(model.prompts).toEqual([]);
  });

  it("requires the owner cookie", async () => {
    expect((await POST(request({ question: "hola", language: "es" }, false))).status).toBe(401);
  });
});
