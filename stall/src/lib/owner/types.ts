// JSON shapes the owner screens read. Timestamps arrive as ISO strings.

export type SaleStatus = "draft" | "awaiting" | "paid" | "paid_cash" | "cancelled";
export type PayoutStatus = "PENDING" | "SUCCESS" | "FAILED" | "UNCLAIMED";
export type DecisionType = "over_limit" | "duplicate_bill" | "manual_payee" | "escalated";
export type DecisionStatus = "open" | "approved" | "declined" | "marked_paid";
export type DecisionAction = "approve" | "decline" | "mark_paid";
export type BillStatus = "open" | "paid" | "held" | "declined";

export type BusinessView = {
  name: string;
  taxRate: number;
  currency: string;
  tz: string;
  today: string;
};

export type PayeeRow = {
  id: string;
  name: string;
  email: string;
  role: "helper" | "supplier";
  dailyRateCents: number | null;
  maxPerDayCents: number;
  autoPay: boolean;
  enabled: boolean;
};

export type CatalogRow = {
  id: string;
  name: string;
  aliases: string[];
  defaultPriceCents: number | null;
  taxable: boolean;
};

export type SaleRow = {
  id: string;
  status: SaleStatus;
  lines: { name: string; qty: number; unitCents: number }[];
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
};

export type DayTotals = {
  count: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  cashCents: number;
  paypalCents: number;
};

export type ShiftRow = { id: string; payeeId: string; date: string; payee: PayeeRow };
export type BillRow = {
  id: string;
  payeeId: string;
  amountCents: number;
  note: string;
  date: string;
  status: BillStatus;
  payee: PayeeRow;
};

export type PayoutRow = {
  id: string;
  shiftId: string | null;
  billId: string | null;
  batchId: string;
  amountCents: number;
  status: PayoutStatus;
  rationale: string;
  createdAt: string;
  /** Resolved server-side through the shift or bill, so it works for any date. */
  payeeName?: string | null;
  payeeRole?: "helper" | "supplier" | null;
};

export type DuplicateEvidence = {
  paidBillId: string;
  payoutBatchId: string;
  amountCents?: number;
  note?: string;
  date?: string;
};

export type DecisionObligation = {
  kind: "shift" | "bill";
  id: string;
  payee: { name: string };
  amountCents: number;
  note?: string;
  date: string;
};

export type DecisionRow = {
  id: string;
  date: string;
  type: DecisionType;
  reason: string;
  status: DecisionStatus;
  source: {
    obligation?: DecisionObligation;
    evidence?: DuplicateEvidence | null;
    /** The deterministic rules' reason (same as `reason`). */
    rulesReason?: string;
    /** The close agent's own words for why it escalated; may echo the rules reason. */
    agentRationale?: string | null;
  };
  shiftId: string | null;
  billId: string | null;
};

export type DayView = {
  sales: SaleRow[];
  totals: DayTotals;
  shifts: ShiftRow[];
  bills: BillRow[];
  payouts: PayoutRow[];
  decisions: DecisionRow[];
};

export type LogEntry = { step: number; tool: string; input: unknown; result: unknown; at: string };

export type CloseView = {
  run: { summary: string; log: LogEntry[]; createdAt: string } | null;
  decisions: DecisionRow[];
  payouts: PayoutRow[];
};

export type RunCloseResult = {
  summary: string;
  paid: { obligationId: string; batchId: string }[];
  held: { decisionId: string }[];
  skipped: number;
  agentNote: string | null;
};

/** Who each shift, bill and payout belongs to, by obligation id. */
export function payeeNames(day: Pick<DayView, "shifts" | "bills"> | null): Map<string, string> {
  const names = new Map<string, string>();
  for (const s of day?.shifts ?? []) names.set(s.id, s.payee.name);
  for (const b of day?.bills ?? []) names.set(b.id, b.payee.name);
  return names;
}

export function payoutPayee(payout: PayoutRow, names: Map<string, string>): string {
  return payout.payeeName ?? names.get(payout.shiftId ?? payout.billId ?? "") ?? "Unknown payee";
}
