import { eq } from "drizzle-orm";
import type { Db, Payout } from "@/db";
import { payouts } from "@/db/schema";
import { emit } from "@/lib/events";

export type PayoutFinalStatus = "SUCCESS" | "FAILED" | "UNCLAIMED";

/**
 * The one place a payout's status changes from PayPal news (webhook or polling).
 * A late UNCLAIMED must not undo a final SUCCESS/FAILED.
 */
export async function applyPayoutStatus(
  db: Db,
  payout: Pick<Payout, "id" | "status">,
  status: PayoutFinalStatus,
  itemId?: string,
): Promise<"processed" | "ignored"> {
  if (status === "UNCLAIMED" && (payout.status === "SUCCESS" || payout.status === "FAILED")) {
    return "ignored";
  }
  await db
    .update(payouts)
    .set(itemId ? { status, itemId } : { status })
    .where(eq(payouts.id, payout.id));
  emit({ type: "payout.updated", payoutId: payout.id });
  return "processed";
}

/** Maps a PayPal payout item transaction_status; undefined means "still in flight". */
export function mapItemStatus(transactionStatus: string | undefined): PayoutFinalStatus | undefined {
  switch (transactionStatus) {
    case "SUCCESS":
      return "SUCCESS";
    case "UNCLAIMED":
      return "UNCLAIMED";
    case "FAILED":
    case "BLOCKED":
    case "DENIED":
    case "RETURNED":
    case "REFUNDED":
      return "FAILED";
    default:
      return undefined;
  }
}
