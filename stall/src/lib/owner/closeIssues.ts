// Turns the close log's raw errors into something the owner can act on, and
// finds payouts that were attempted but never sent (no payout row exists).
import type { DayView, LogEntry, PayoutRow } from "./types";

export type ErrorKind = "ai" | "network" | "paypal" | "rules" | "other";

const PAY_TOOLS = new Set(["pay_obligation", "auto_pay"]);

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

/** Classifies a raw error string; the raw text stays available as details. */
export function errorKind(raw: string, tool?: string): ErrorKind {
  const text = raw.toLowerCase();
  if (tool === "model_error") return "ai";
  if (/fetch failed|econn|etimedout|enotfound|network|timed? ?out|socket/.test(text)) return "network";
  if (/payout (failed|exists)|paypal/.test(text)) return "paypal";
  if (/not payable|cannot hold|already (held|paid)|limit|unknown obligation/.test(text)) return "rules";
  if (/api[- ]?key|unauthori[sz]ed|authentication|anthropic|model|rate limit|overloaded/.test(text)) return "ai";
  return "other";
}

export type FailedPayout = { obligationId: string; payeeName: string; amountCents: number; error: string };

/**
 * Obligations the close tried to pay where PayPal never took the money: the
 * last pay attempt failed and no payout row exists for it.
 */
export function failedPayouts(
  log: LogEntry[],
  payouts: PayoutRow[],
  day: Pick<DayView, "shifts" | "bills"> | null,
): FailedPayout[] {
  const last = new Map<string, { ok: boolean; error: string }>();
  for (const entry of log) {
    if (!PAY_TOOLS.has(entry.tool)) continue;
    const id = field(entry.input, "obligationId");
    if (typeof id !== "string") continue;
    const ok = field(entry.result, "ok") === true;
    const error = field(entry.result, "error");
    last.set(id, { ok, error: typeof error === "string" ? error : "" });
  }
  const withRow = new Set(payouts.flatMap((p) => [p.shiftId, p.billId]).filter(Boolean));
  const result: FailedPayout[] = [];
  for (const [id, attempt] of last) {
    if (attempt.ok || withRow.has(id) || !/^payout /.test(attempt.error)) continue;
    const shift = day?.shifts.find((s) => s.id === id);
    const bill = day?.bills.find((b) => b.id === id);
    if (bill?.status === "paid") continue;
    const payeeName = shift?.payee.name ?? bill?.payee.name;
    if (!payeeName) continue;
    result.push({
      obligationId: id,
      payeeName,
      amountCents: bill?.amountCents ?? shift?.payee.dailyRateCents ?? 0,
      error: attempt.error,
    });
  }
  return result;
}
