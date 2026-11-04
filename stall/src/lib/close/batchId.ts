import { createHash } from "node:crypto";

/**
 * The one payout batch id scheme: a deterministic 30-char id (PayPal caps
 * sender_batch_id at 30 and sender_item_id at 63). `st-{s|b}-{25 hex of sha256}`.
 */
export function obligationBatchId(businessId: string, kind: "shift" | "bill", id: string): string {
  const hash = createHash("sha256").update(`${businessId}:${kind}:${id}`).digest("hex").slice(0, 25);
  return `st-${kind === "shift" ? "s" : "b"}-${hash}`;
}
