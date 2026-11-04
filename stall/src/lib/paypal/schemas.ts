import { z } from "zod";
import { PayPalError } from "./client";

// The parts of PayPal's responses this app relies on. Anything else is ignored.

const money = z.string().regex(/^-?\d+\.\d{2}$/);

export const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

/** With Prefer: return=representation PayPal sends the invoice; otherwise only a link to it. */
export const invoiceCreateSchema = z
  .object({ id: z.string().min(1).optional(), href: z.string().min(1).optional() })
  .refine((v) => v.id !== undefined || v.href !== undefined, { path: ["id"], message: "id or href" });

export const invoiceGetSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  amount: z.object({ value: money }),
  detail: z.object({ metadata: z.object({ recipient_view_url: z.string().min(1) }) }),
});

export const invoiceStatusSchema = invoiceGetSchema.pick({ id: true, status: true });

export const payoutCreateSchema = z.object({
  batch_header: z.object({ payout_batch_id: z.string().min(1), batch_status: z.string().min(1) }),
});

export const payoutGetSchema = z.object({
  batch_header: z.object({ batch_status: z.string().min(1) }),
  items: z
    .array(z.object({ payout_item_id: z.string().min(1), transaction_status: z.string().min(1) }))
    .optional(),
});

export const webhookVerifySchema = z.object({ verification_status: z.string().min(1) });

/**
 * Checks a PayPal response against `schema`. A mismatch is a status-0 PayPalError
 * naming only the first bad path: the body may hold personal data, so it is never included.
 */
export function parseResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const path = result.error.issues[0]?.path.join(".") || "(root)";
  throw new PayPalError(`invalid response shape: ${path}`, 0, "");
}
