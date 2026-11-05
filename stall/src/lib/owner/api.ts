// Browser-side calls for the owner screens. Nothing throws: every failure comes
// back as a status (0 = no connection) and the server's error code.
import { messagesFor } from "@/lib/i18n";
import type { Language } from "@/lib/parse/schema";

export type OwnerResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string };

/** The owner cookie expired mid-session: go and enter the PIN again, then come back. */
function toPin(): void {
  const here = window.location.pathname + window.location.search;
  // A full load, not a router push: the proxy has to see the request without a cookie.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
  window.location.href = `/pin?next=${encodeURIComponent(here)}`;
}

export async function ownerCall<T>(url: string, init?: RequestInit): Promise<OwnerResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, code: "network" };
  }
  if (response.status === 401) toPin();
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body: fall through with the status alone.
  }
  if (!response.ok) {
    const code = (body as { error?: unknown } | null)?.error;
    return { ok: false, status: response.status, code: typeof code === "string" ? code : "server" };
  }
  return { ok: true, data: body as T };
}

export const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Plain words for a failed call, for the screens' error boxes, in the owner's language. */
export function failureText(failure: { status: number; code: string }, language: Language = "en"): string {
  const { common, errors } = messagesFor(language);
  if (failure.status === 0) return common.noConnection;
  if (failure.code === "paypal") return errors.paypal;
  if (failure.code === "already_resolved") return errors.alreadyResolved;
  if (failure.code === "already_paid") return errors.alreadyPaid;
  if (failure.code === "has_payout") return errors.hasPayout;
  if (failure.code === "has_decision") return errors.hasDecision;
  if (failure.code === "payout_exists_unrecorded") return errors.payoutUnrecorded;
  if (failure.code === "no_amount") return errors.noAmount;
  if (failure.code === "amount_changed") return errors.amountChanged;
  if (failure.code === "parse_failed") return errors.parseFailed;
  if (failure.code === "rate_over_limit") return errors.rateOverLimit;
  if (failure.status === 400) return errors.invalid;
  return common.serverError;
}
