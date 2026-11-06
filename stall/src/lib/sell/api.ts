// Browser-side calls to the sell API. Every failure is mapped to a small set of
// kinds the screen knows how to explain; nothing here throws.
import type { Language, ParsedSale } from "@/lib/parse/schema";
import type { SaleLineInput } from "@/lib/sell/rows";

export type FailureKind =
  /** 422 from parse: the model found no order in the transcript. */
  | "no-order"
  /** 502: PayPal did not answer or refused. */
  | "paypal"
  /** fetch itself failed: no signal, server down. */
  | "network"
  /** 400: the request was rejected as invalid. */
  | "invalid"
  /** 409: the sale is not in a state that allows this. */
  | "conflict"
  /** Anything else (500, unexpected body). */
  | "server";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; kind: FailureKind };

export type ChargeResponse = {
  saleId: string;
  qrPng: string;
  payLink: string;
  totalCents: number;
};

export type BusinessInfo = { name: string; taxRate: number; currency: string };

export type ChargeRequest = {
  draftId: string;
  lines: SaleLineInput[];
  tipPct: 0 | 15 | 18 | 20 | null;
  language: Language;
  transcript: string;
};

function kindFor(status: number): FailureKind {
  if (status === 422) return "no-order";
  if (status === 502) return "paypal";
  if (status === 400) return "invalid";
  if (status === 409) return "conflict";
  return "server";
}

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, kind: "network" };
  }
  if (!response.ok) return { ok: false, kind: kindFor(response.status) };
  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, kind: "server" };
  }
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export type LastSale = {
  saleId: string;
  invoiceNumber: string | null;
  totalCents: number;
  status: "awaiting" | "paid" | "paid_cash";
  items: string;
  createdAt: string;
};

export type CancelResult =
  | { ok: true; was: "awaiting" | "paid_cash" | "draft" }
  | { ok: false; kind: FailureKind | "paid_paypal" | "already_cancelled" | "changed" | "not_found" };

/** Cancel reads the reason from a 409/404 body, so the screen can say what to do. */
async function cancelCall(saleId: string): Promise<CancelResult> {
  let response: Response;
  try {
    response = await fetch(`/api/sales/${encodeURIComponent(saleId)}/cancel`, { method: "POST" });
  } catch {
    return { ok: false, kind: "network" };
  }
  const body = (await response.json().catch(() => null)) as { was?: string; error?: string } | null;
  if (response.ok && body?.was) return { ok: true, was: body.was as "awaiting" | "paid_cash" | "draft" };
  const reason = body?.error;
  if (reason === "paid_paypal" || reason === "already_cancelled" || reason === "changed" || reason === "not_found") {
    return { ok: false, kind: reason };
  }
  return { ok: false, kind: response.ok ? "server" : kindFor(response.status) };
}

export const sellApi = {
  business: () => call<BusinessInfo>("/api/business"),
  parse: (transcript: string, language: Language) =>
    call<ParsedSale>("/api/sales/parse", json({ transcript, language })),
  charge: (request: ChargeRequest) => call<ChargeResponse>("/api/sales", json(request)),
  cash: (saleId: string) =>
    call<{ status: string }>(`/api/sales/${encodeURIComponent(saleId)}/cash`, { method: "POST" }),
  lastSale: () => call<{ sale: LastSale | null }>("/api/sales/last"),
  cancel: cancelCall,
};

export type SellApi = typeof sellApi;
