// Browser-side calls for the owner screens. Nothing throws: every failure comes
// back as a status (0 = no connection) and the server's error code.

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

/** Plain words for a failed call, for the screens' error boxes. */
export function failureText(failure: { status: number; code: string }): string {
  if (failure.status === 0) return "No connection. Check your signal and try again.";
  if (failure.code === "paypal") return "PayPal is not responding. Try again in a moment.";
  if (failure.code === "already_resolved") return "This was already decided. The card shows the outcome.";
  if (failure.code === "already_paid") return "This was already paid, so nothing more was sent.";
  if (failure.code === "has_payout") return "Already paid";
  if (failure.code === "has_decision") return "Waiting on your decision on Close";
  if (failure.code === "parse_failed") return "Couldn't read that. Try again or fill in the form.";
  if (failure.status === 400) return "Something in the form is not right. Check it and try again.";
  return "Something went wrong on the server. Try again.";
}
