import { env } from "@/lib/env";

export const PAYPAL_HOST = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

export class PayPalError extends Error {
  readonly status: number;
  readonly debugId?: string;
  readonly body: string;

  constructor(message: string, status: number, body: string, debugId?: string) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
    this.body = body;
    this.debugId = debugId;
  }
}

// Refresh this long before the token actually expires.
const REFRESH_MARGIN_MS = 60_000;

let tokenCache: { token: string; refreshAt: number } | undefined;

export function resetTokenCache(): void {
  tokenCache = undefined;
}

function baseUrl(): string {
  return PAYPAL_HOST[env.PAYPAL_ENV];
}

export async function getAccessToken(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.refreshAt) {
    return tokenCache.token;
  }

  const basic = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetchImpl(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new PayPalError(
      `PayPal token request failed with status ${res.status}`,
      res.status,
      text,
      parseDebugId(text),
    );
  }

  const data = JSON.parse(text) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    refreshAt: Date.now() + data.expires_in * 1000 - REFRESH_MARGIN_MS,
  };
  return data.access_token;
}

function parseDebugId(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { debug_id?: unknown };
    return typeof parsed.debug_id === "string" ? parsed.debug_id : undefined;
  } catch {
    return undefined;
  }
}

export async function paypalFetch<T>(opts: {
  method: "GET" | "POST" | "PATCH" | "PUT";
  path: string;
  body?: unknown;
  requestId?: string;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = await getAccessToken(fetchImpl);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
  if (opts.method === "POST") headers.Prefer = "return=representation";

  const res = await fetchImpl(`${baseUrl()}${opts.path}`, {
    method: opts.method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) {
    const debugId = parseDebugId(text);
    const suffix = debugId ? ` (debug_id ${debugId})` : "";
    throw new PayPalError(
      `PayPal ${opts.method} ${opts.path} failed with status ${res.status}${suffix}`,
      res.status,
      text,
      debugId,
    );
  }
  if (text === "") return undefined as T;
  return JSON.parse(text) as T;
}

// PayPal amounts are strings with exactly two decimals; internally we use integer cents.
export function toMoney(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`toMoney expects integer cents, got ${cents}`);
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function fromMoney(amount: string): number {
  const match = /^(-?)(\d+)\.(\d{2})$/.exec(amount);
  if (!match) {
    throw new RangeError(`fromMoney expects a two-decimal amount, got "${amount}"`);
  }
  const [, sign, whole, fraction] = match;
  const cents = Number(whole) * 100 + Number(fraction);
  return sign === "-" ? -cents : cents;
}
