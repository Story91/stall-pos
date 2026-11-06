// PayPal Agent Toolkit (`@paypal/agent-toolkit`), read-only, for the close agent.
// Stall moves money only through its own Payouts tool, behind code-enforced limits;
// the toolkit gives the agent a look at PayPal's own invoice list, so it can tell the
// owner which QR invoices from today were never paid.
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { isMockEnabled } from "./mock";

/** What the close agent sees: small and structured, never raw PayPal JSON. */
export type UnpaidInvoice = { invoiceId: string; number: string; status: string; total: string };

export type InvoiceLookup = {
  /** Invoices dated `date` that PayPal still shows as unpaid. */
  unpaidOn(date: string): Promise<UnpaidInvoice[]>;
};

const UNPAID = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "SCHEDULED"]);
const MAX_LISTED = 10;

type ExecutableTool = { execute?: (args: unknown, options: unknown) => Promise<unknown> };

function field(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>(
    (at, key) => (typeof at === "object" && at !== null ? (at as Record<string, unknown>)[key] : undefined),
    value,
  );
}

/** Pulls the unpaid invoices for one date out of a `list_invoices` result (object or JSON text). */
export function unpaidFromList(result: unknown, date: string): UnpaidInvoice[] {
  let body = result;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return [];
    }
  }
  const items = field(body, "items");
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => UNPAID.has(String(field(item, "status"))) && field(item, "detail", "invoice_date") === date)
    .slice(0, MAX_LISTED)
    .map((item) => ({
      invoiceId: String(field(item, "id") ?? ""),
      number: String(field(item, "detail", "invoice_number") ?? ""),
      status: String(field(item, "status")),
      total: `${String(field(item, "amount", "value") ?? "?")} ${String(field(item, "amount", "currency_code") ?? "")}`.trim(),
    }));
}

/**
 * The toolkit's `list_invoices`, built per close. Null when PayPal is mocked or not
 * configured, so tests and the mock demo never reach PayPal through it.
 */
export function createInvoiceLookup(env: Record<string, string | undefined> = process.env): InvoiceLookup | null {
  if (isMockEnabled("PAYPAL_MOCK", env) || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return null;
  const toolkit = new PayPalAgentToolkit({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    configuration: {
      actions: { invoices: { list: true } },
      context: { sandbox: env.PAYPAL_ENV !== "live" },
    },
  });
  const listTool = (toolkit.getTools() as Record<string, ExecutableTool>).list_invoices;
  return {
    async unpaidOn(date) {
      if (!listTool?.execute) throw new Error("toolkit list_invoices unavailable");
      const result = await listTool.execute(
        { page: 1, page_size: 50, total_required: false },
        { toolCallId: "close-list-invoices", messages: [] },
      );
      return unpaidFromList(result, date);
    },
  };
}
