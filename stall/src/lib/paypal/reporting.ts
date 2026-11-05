// PayPal Transaction Search: what PayPal itself recorded on the merchant account.
// Used read-only, to check the day's ledger against PayPal (see lib/close/reconcile.ts).
import { z } from "zod";
import { fromMoney, paypalFetch } from "./client";
import { parseResponse } from "./schemas";

const money = z.object({ currency_code: z.string(), value: z.string().regex(/^-?\d+\.\d{2}$/) });

export const transactionsSchema = z.object({
  transaction_details: z
    .array(
      z.object({
        transaction_info: z.object({
          transaction_id: z.string().min(1),
          transaction_event_code: z.string().optional(),
          transaction_initiation_date: z.string().min(1),
          transaction_amount: money,
          transaction_status: z.string().optional(),
          invoice_id: z.string().optional(),
        }),
      }),
    )
    .default([]),
});

/** One PayPal transaction, reduced to what reconciliation compares. Cents are signed: money in > 0. */
export type PayPalTxn = {
  id: string;
  at: string;
  cents: number;
  currency: string;
  /** D denied, P pending, S success, V reversed. */
  status: string;
  invoiceId: string | null;
  code: string | null;
};

/**
 * `GET /v1/reporting/transactions` for a time window (PayPal allows up to 31 days).
 * PayPal can take up to a few hours to list a new transaction here.
 */
export async function listTransactions(start: Date, end: Date, fetchImpl?: typeof fetch): Promise<PayPalTxn[]> {
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const query = new URLSearchParams({
    start_date: iso(start),
    end_date: iso(end),
    fields: "transaction_info",
    page_size: "500",
  });
  const body = parseResponse(
    transactionsSchema,
    await paypalFetch<unknown>({ method: "GET", path: `/v1/reporting/transactions?${query}`, fetchImpl }),
  );
  return body.transaction_details.map(({ transaction_info: t }) => ({
    id: t.transaction_id,
    at: t.transaction_initiation_date,
    cents: fromMoney(t.transaction_amount.value),
    currency: t.transaction_amount.currency_code,
    status: t.transaction_status ?? "S",
    invoiceId: t.invoice_id ?? null,
    code: t.transaction_event_code ?? null,
  }));
}
