import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTokenCache } from "@/lib/paypal/client";
import { listTransactions } from "@/lib/paypal/reporting";

beforeAll(() => {
  vi.stubEnv("PAYPAL_CLIENT_ID", "id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "wh");
  vi.stubEnv("PAYPAL_ENV", "sandbox");
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/s");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk");
  vi.stubEnv("OWNER_PIN", "1234");
  vi.stubEnv("CLOSE_TRIGGER_KEY", "k");
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => resetTokenCache());

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("listTransactions", () => {
  it("asks Transaction Search for the window and returns signed cents", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/v1/oauth2/token")
        ? json({ access_token: "t", expires_in: 3600 })
        : json({
            transaction_details: [
              { transaction_info: { transaction_id: "T1", transaction_initiation_date: "2026-11-04T18:00:00+0000", transaction_amount: { currency_code: "USD", value: "12.50" }, transaction_status: "S", invoice_id: "STALL-1", transaction_event_code: "T0011" } },
              { transaction_info: { transaction_id: "T2", transaction_initiation_date: "2026-11-04T20:00:00+0000", transaction_amount: { currency_code: "USD", value: "-120.00" } } },
            ],
          }),
    );
    const txns = await listTransactions(new Date("2026-11-03T00:00:00Z"), new Date("2026-11-05T00:00:00Z"), fetchImpl as unknown as typeof fetch);
    const url = fetchImpl.mock.calls[1]![0] as string;
    expect(url).toContain("/v1/reporting/transactions?start_date=2026-11-03T00%3A00%3A00Z&end_date=2026-11-05T00%3A00%3A00Z");
    expect(txns).toEqual([
      { id: "T1", at: "2026-11-04T18:00:00+0000", cents: 1250, currency: "USD", status: "S", invoiceId: "STALL-1", code: "T0011" },
      { id: "T2", at: "2026-11-04T20:00:00+0000", cents: -12000, currency: "USD", status: "S", invoiceId: null, code: null },
    ]);
  });

  it("treats an empty report as no transactions", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/v1/oauth2/token") ? json({ access_token: "t", expires_in: 3600 }) : json({}),
    );
    expect(await listTransactions(new Date(0), new Date(1000), fetchImpl as unknown as typeof fetch)).toEqual([]);
  });
});
