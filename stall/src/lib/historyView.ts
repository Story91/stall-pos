// The History ledger as the browser sees it, and the "view" the AI may ask for.
// Client-safe (no server imports): the server reuses the types, the view schema
// and `totalsOf`; the page reuses `applyView`, `historySummary` and `describeView`.
import { z } from "zod";
import { daysAgo } from "@/lib/dates";
import { messagesFor, type Messages } from "@/lib/i18n";
import type { Language } from "@/lib/parse/schema";
import { formatCents } from "@/lib/sell/format";

export const HISTORY_KINDS = ["sale", "payout"] as const;
export const HISTORY_METHODS = ["paypal", "cash", "payout"] as const;
/** Sales in the ledger are paid ones only; payouts appear in every status they can have. */
export const HISTORY_STATUSES = ["paid", "paid_cash", "PENDING", "SUCCESS", "FAILED", "UNCLAIMED"] as const;
export const HISTORY_RANGES = ["today", "7d", "30d"] as const;
/** Grid columns a view may sort by (they match the grid's column ids). */
export const VIEW_COLUMNS = ["at", "kind", "who", "method", "status", "inCents", "outCents"] as const;

export type HistoryKind = (typeof HISTORY_KINDS)[number];
export type HistoryMethod = (typeof HISTORY_METHODS)[number];
export type HistoryStatus = (typeof HISTORY_STATUSES)[number];
export type HistoryRange = (typeof HISTORY_RANGES)[number];
export type ViewColumn = (typeof VIEW_COLUMNS)[number];

/** One ledger line. Money is integer cents; `date` is the business date of `at`. */
export type HistoryRow = {
  id: string;
  kind: HistoryKind;
  date: string;
  at: string;
  /** Payee name for payouts; null for sales. */
  who: string | null;
  /** "2× Taco al pastor, 1× Agua fresca" for a sale; what a payout was for. */
  items: string;
  method: HistoryMethod;
  status: HistoryStatus;
  inCents: number;
  outCents: number;
  taxCents: number;
  tipCents: number;
  invoiceNumber: string | null;
};

export type HistoryTotals = { inCents: number; outCents: number; netCents: number; sales: number; payouts: number };
export type HistoryResponse = { rows: HistoryRow[]; totals: HistoryTotals };

/**
 * A failed payout moved no money, so it never counts as money out. Pending and
 * unclaimed payouts do: PayPal has already taken the amount from the balance.
 */
export function movesMoney(row: Pick<HistoryRow, "kind" | "status">): boolean {
  return row.kind === "sale" || row.status !== "FAILED";
}

/** The money a row is about: what a sale took in, or what a payout sent (or tried to). */
export function rowAmount(row: Pick<HistoryRow, "kind" | "inCents" | "outCents">): number {
  return row.kind === "sale" ? row.inCents : row.outCents;
}

export function totalsOf(rows: readonly HistoryRow[]): HistoryTotals {
  let inCents = 0;
  let outCents = 0;
  let sales = 0;
  let payouts = 0;
  for (const row of rows) {
    if (row.kind === "sale") {
      sales++;
      inCents += row.inCents;
    } else {
      payouts++;
      if (movesMoney(row)) outCents += row.outCents;
    }
  }
  return { inCents, outCents, netCents: inCents - outCents, sales, payouts };
}

/** First and last business date of a range chip, inclusive. */
export function rangeDates(range: HistoryRange, today: string): { from: string; to: string } {
  const back = range === "today" ? 0 : range === "7d" ? 6 : 29;
  return { from: daysAgo(today, back), to: today };
}

// ---------------------------------------------------------------------------
// The AI view: a filter description, never numbers about the data itself.

/** The longest question the ask box and the route accept. */
export const MAX_QUESTION_LENGTH = 300;
const MAX_CENTS = 100_000_000;
const MAX_TEXT = 60;

/**
 * What the model returns. Lenient on purpose (enums only, no numeric or length
 * bounds the provider's structured output might reject); `historyViewSchema`
 * then checks every bound before anything reaches the grid.
 */
export const modelViewSchema = z.object({
  range: z
    .enum(HISTORY_RANGES)
    .describe('"today"; "7d" for this week, yesterday or the last few days; "30d" for this month or anything older'),
  kind: z.enum(HISTORY_KINDS).nullish().describe('"sale" for money in, "payout" for money paid to people or suppliers'),
  method: z.enum(HISTORY_METHODS).nullish().describe('Only when asked: "cash" or "paypal" sales, or "payout"'),
  statuses: z
    .array(z.enum(HISTORY_STATUSES))
    .nullish()
    .describe("Only when the question is about a status, like failed or unclaimed payouts"),
  who: z.string().nullish().describe("A payee name, copied exactly from the payee list when it matches one"),
  minCents: z.number().nullish().describe("Lowest amount, in integer cents (20 dollars = 2000)"),
  maxCents: z.number().nullish().describe("Highest amount, in integer cents"),
  search: z.string().nullish().describe("A word to find in the items, like an item name; never a payee name"),
  sort: z
    .object({ column: z.enum(VIEW_COLUMNS), direction: z.enum(["asc", "desc"]) })
    .nullish()
    .describe('Only for "biggest", "smallest", "latest", "oldest" questions'),
  answerHint: z.string().describe("One short sentence in the owner's language saying what the view shows; no numbers"),
});

const optionalText = z
  .string()
  .trim()
  .max(MAX_TEXT)
  .nullish()
  .transform((value) => (value ? value : undefined));
const optionalCents = z
  .number()
  .int()
  .min(0)
  .max(MAX_CENTS)
  .nullish()
  .transform((value) => value ?? undefined);

/** The view the client applies. Strict: anything out of bounds fails, and the route answers 422. */
export const historyViewSchema = z
  .object({
    range: z.enum(HISTORY_RANGES),
    kind: z.enum(HISTORY_KINDS).nullish().transform((v) => v ?? undefined),
    method: z.enum(HISTORY_METHODS).nullish().transform((v) => v ?? undefined),
    statuses: z
      .array(z.enum(HISTORY_STATUSES))
      .max(HISTORY_STATUSES.length)
      .nullish()
      .transform((v) => (v && v.length > 0 ? [...new Set(v)] : undefined)),
    who: optionalText,
    minCents: optionalCents,
    maxCents: optionalCents,
    search: optionalText,
    sort: z
      .object({ column: z.enum(VIEW_COLUMNS), direction: z.enum(["asc", "desc"]) })
      .nullish()
      .transform((v) => v ?? undefined),
    answerHint: z.string().trim().max(200),
  })
  .transform((view): HistoryView =>
    // "Between 50 and 20" still means between 20 and 50.
    view.minCents !== undefined && view.maxCents !== undefined && view.minCents > view.maxCents
      ? { ...view, minCents: view.maxCents, maxCents: view.minCents }
      : view,
  );

/** A checked view: every field but `range` and `answerHint` may be absent. */
export type HistoryView = {
  range: HistoryRange;
  kind?: HistoryKind;
  method?: HistoryMethod;
  statuses?: HistoryStatus[];
  who?: string;
  minCents?: number;
  maxCents?: number;
  search?: string;
  sort?: { column: ViewColumn; direction: "asc" | "desc" };
  answerHint: string;
};

/** Case- and accent-insensitive form for matching: "María" and "maria" are the same name. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** True when a row passes every condition of the view. The range is applied by loading, not here. */
export function rowMatchesView(row: HistoryRow, view: HistoryView): boolean {
  if (view.kind && row.kind !== view.kind) return false;
  if (view.method && row.method !== view.method) return false;
  if (view.statuses && !view.statuses.includes(row.status)) return false;
  if (view.who && !fold(row.who ?? "").includes(fold(view.who))) return false;
  const amount = rowAmount(row);
  if (view.minCents !== undefined && amount < view.minCents) return false;
  if (view.maxCents !== undefined && amount > view.maxCents) return false;
  if (view.search) {
    const haystack = fold([row.items, row.who ?? "", row.invoiceNumber ?? ""].join(" "));
    if (!haystack.includes(fold(view.search))) return false;
  }
  return true;
}

function compareBy(column: ViewColumn): (a: HistoryRow, b: HistoryRow) => number {
  switch (column) {
    case "inCents":
    case "outCents":
      return (a, b) => a[column] - b[column];
    case "who":
      return (a, b) => (a.who ?? a.items).localeCompare(b.who ?? b.items);
    default:
      return (a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0);
  }
}

/** The rows the view selects, in the view's order (or the given order when it names none). */
export function applyView(rows: readonly HistoryRow[], view: HistoryView): HistoryRow[] {
  const kept = rows.filter((row) => rowMatchesView(row, view));
  if (!view.sort) return kept;
  const compare = compareBy(view.sort.column);
  const sign = view.sort.direction === "asc" ? 1 : -1;
  return kept.sort((a, b) => sign * compare(a, b));
}

/**
 * The sentence above the grid, built by code from the rows themselves (the model
 * never states an amount): "3 cash sales, $64.20" or
 * "5 sales, $120.00 · 2 payouts, $360.00 · net -$240.00".
 */
export function historySummary(rows: readonly HistoryRow[], language: Language): string {
  const s = messagesFor(language).history.summary;
  const sales = rows.filter((row) => row.kind === "sale");
  const sent = rows.filter((row) => row.kind === "payout" && movesMoney(row));
  const failed = rows.filter((row) => row.kind === "payout" && !movesMoney(row));
  const sum = (list: HistoryRow[]) => list.reduce((total, row) => total + rowAmount(row), 0);

  const parts: string[] = [];
  if (sales.length > 0) {
    const methods = new Set(sales.map((row) => row.method));
    const only = methods.size === 1 ? sales[0]!.method : null;
    parts.push(s.sales(sales.length, formatCents(sum(sales)), only === "cash" || only === "paypal" ? only : null));
  }
  if (sent.length > 0) parts.push(s.payouts(sent.length, formatCents(sum(sent))));
  if (failed.length > 0) parts.push(s.failed(failed.length, formatCents(sum(failed))));
  if (sales.length > 0 && sent.length > 0) parts.push(s.net(formatCents(sum(sales) - sum(sent))));
  return parts.length > 0 ? parts.join(" · ") : s.nothing;
}

/** The view's conditions as short chips, in the owner's language, so they can see how the question was read. */
export function describeView(view: HistoryView, t: Messages): string[] {
  const h = t.history;
  const chips: string[] = [h.ranges[view.range]];
  if (view.kind) chips.push(h.kindPlural[view.kind]);
  if (view.method && view.method !== "payout") chips.push(h.method[view.method]);
  if (view.statuses) chips.push(view.statuses.map((status) => h.status[status]).join(" / "));
  if (view.who) chips.push(view.who);
  if (view.minCents !== undefined) chips.push(h.chips.atLeast(formatCents(view.minCents)));
  if (view.maxCents !== undefined) chips.push(h.chips.atMost(formatCents(view.maxCents)));
  if (view.search) chips.push(h.chips.search(view.search));
  if (view.sort) {
    const { column, direction } = view.sort;
    const by = column === "at" ? "time" : column === "inCents" || column === "outCents" ? "amount" : "text";
    chips.push(h.chips.sorted(h.columns[column], direction, by));
  }
  return chips;
}
