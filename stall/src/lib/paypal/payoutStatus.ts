import { and, eq, notInArray } from "drizzle-orm";
import type { Db, Payout } from "@/db";
import { bills, payouts } from "@/db/schema";
import { emit } from "@/lib/events";

export type PayoutFinalStatus = "SUCCESS" | "FAILED" | "UNCLAIMED";

/**
 * The one place a payout's status changes from PayPal news (webhook or polling).
 * A late UNCLAIMED must not undo a final SUCCESS/FAILED. A FAILED bill payout
 * reopens the bill, so the next close escalates it instead of counting it as paid.
 */
export async function applyPayoutStatus(
  db: Db,
  payout: Pick<Payout, "id" | "status">,
  status: PayoutFinalStatus,
  itemId?: string,
): Promise<"processed" | "ignored"> {
  // Guarded in SQL so a stale snapshot (a slow PayPal lookup racing a webhook) cannot undo a newer status.
  const guard =
    status === "UNCLAIMED"
      ? and(eq(payouts.id, payout.id), eq(payouts.status, payout.status), notInArray(payouts.status, ["SUCCESS", "FAILED"]))
      : and(eq(payouts.id, payout.id), eq(payouts.status, payout.status));
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(payouts)
      .set(itemId ? { status, itemId } : { status })
      .where(guard)
      .returning({ id: payouts.id, billId: payouts.billId });
    const billId = rows[0]?.billId;
    if (status === "FAILED" && billId) {
      await tx
        .update(bills)
        .set({ status: "open" })
        .where(and(eq(bills.id, billId), eq(bills.status, "paid")));
    }
    return rows;
  });
  if (updated.length === 0) return "ignored";
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
