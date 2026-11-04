import type { Db, Payout } from "@/db";
import { PayPalError } from "@/lib/paypal/client";
import { isMockEnabled } from "@/lib/paypal/mock";
import { getPayoutBatch } from "@/lib/paypal/payouts";
import { applyPayoutStatus, mapItemStatus } from "@/lib/paypal/payoutStatus";

// Polling fallback for when no PayPal webhook is registered: at most one batch
// lookup per payout every PAYOUT_RECONCILE_INTERVAL_MS, until it is final.
const PAYOUT_RECONCILE_INTERVAL_MS = 5000;
const lastChecked = new Map<string, number>();

export function resetPayoutReconcileThrottle(): void {
  lastChecked.clear();
}

export type PayoutReconcileDeps = {
  getPayoutBatch?: typeof getPayoutBatch;
  nowMs?: () => number;
};

/** Asks PayPal about PENDING payouts. Returns true when at least one row changed. */
export async function reconcilePayouts(
  db: Db,
  rows: Pick<Payout, "id" | "status" | "paypalBatchId">[],
  deps: PayoutReconcileDeps = {},
): Promise<boolean> {
  const lookup = deps.getPayoutBatch ?? (isMockEnabled("PAYPAL_MOCK") ? undefined : getPayoutBatch);
  if (!lookup) return false;
  const nowMs = (deps.nowMs ?? Date.now)();
  let changed = false;
  for (const row of rows) {
    if (row.status !== "PENDING" || !row.paypalBatchId) {
      lastChecked.delete(row.id);
      continue;
    }
    const last = lastChecked.get(row.id);
    if (last !== undefined && nowMs - last < PAYOUT_RECONCILE_INTERVAL_MS) continue;
    lastChecked.set(row.id, nowMs);
    try {
      const batch = await lookup(row.paypalBatchId);
      const item = batch.items[0];
      const status = mapItemStatus(item?.status);
      if (!status) continue;
      await applyPayoutStatus(db, row, status, item?.itemId);
      lastChecked.delete(row.id);
      changed = true;
    } catch (error) {
      // Best effort: the stored status is still correct. Log ids and status only.
      const reason = error instanceof PayPalError ? `status ${error.status}` : "error";
      console.error(`stall: payout status check failed for payout ${row.id} (${reason})`);
    }
  }
  return changed;
}
