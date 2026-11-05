import { and, gte, inArray, isNotNull, isNull, lte, or, eq } from "drizzle-orm";
import { z } from "zod";
import type { Business, Db, Sale } from "@/db";
import { sales } from "@/db/schema";
import { businessDate } from "@/lib/dates";
import { isoDate } from "@/lib/obligations";
import { toMoney } from "@/lib/paypal/client";
import { getBusiness } from "@/lib/sales";

const HEADER = "date,invoice_number,status,method,subtotal,tax,tip,total,items";
export const PAID_STATUSES: Sale["status"][] = ["paid", "paid_cash"];
const MAX_DAYS = 92;
const DAY_MS = 86_400_000;

/** `from` and `to` are business dates, inclusive; the range may span at most 92 days. */
export const exportQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine(({ from, to }) => from <= to, { message: "from must be on or before to", path: ["to"] })
  .refine(
    ({ from, to }) =>
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1 <= MAX_DAYS,
    { message: `The range may span at most ${MAX_DAYS} days`, path: ["to"] },
  );
export type ExportQuery = z.infer<typeof exportQuery>;

/** RFC 4180: quote a field that holds a comma, a quote or a line break; double inner quotes. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Paid sales as CSV (CRLF line endings), oldest first. `tz` is the business
 * timezone used for the `date` column. Only `paid` and `paid_cash` sales appear.
 */
export function salesToCsv(rows: Sale[], tz: string): string {
  const paid = rows
    .filter((sale) => PAID_STATUSES.includes(sale.status))
    .sort((a, b) => settledAt(a).getTime() - settledAt(b).getTime());

  const lines = paid.map((sale) =>
    [
      businessDate(settledAt(sale), tz),
      sale.invoiceNumber ?? "",
      sale.status,
      sale.status === "paid_cash" ? "cash" : "paypal",
      toMoney(sale.subtotalCents),
      toMoney(sale.taxCents),
      toMoney(sale.tipCents),
      toMoney(sale.totalCents),
      sale.lines.map((line) => `${line.qty}× ${line.name}`).join("; "),
    ]
      .map(csvField)
      .join(","),
  );

  return [HEADER, ...lines].map((line) => `${line}\r\n`).join("");
}

/** The moment a sale counts for: when it was paid, or when it was created if no payment time is recorded. */
export function settledAt(sale: Pick<Sale, "paidAt" | "createdAt">): Date {
  return sale.paidAt ?? sale.createdAt;
}

/**
 * The UTC instants to load for business dates `[from, to]`: a one-day margin on
 * each side, since a UTC timestamp can fall on a neighbouring business date.
 * Callers then filter the loaded rows by business date exactly.
 */
export function loadWindow(query: ExportQuery): { lo: Date; hi: Date } {
  return {
    lo: new Date(Date.parse(`${query.from}T00:00:00Z`) - DAY_MS),
    hi: new Date(Date.parse(`${query.to}T00:00:00Z`) + 2 * DAY_MS),
  };
}

/** True when `at` falls on a business date inside `[from, to]`. */
export function inBusinessRange(at: Date, query: ExportQuery, tz: string): boolean {
  const date = businessDate(at, tz);
  return date >= query.from && date <= query.to;
}

/** The owner's paid sales whose business date falls in `[from, to]`, in no particular order. */
export async function paidSalesInRange(
  db: Db,
  query: ExportQuery,
): Promise<{ business: Business; rows: Sale[] }> {
  const business = await getBusiness(db);
  const { lo, hi } = loadWindow(query);

  const rows = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.businessId, business.id),
        inArray(sales.status, PAID_STATUSES),
        or(
          and(isNotNull(sales.paidAt), gte(sales.paidAt, lo), lte(sales.paidAt, hi)),
          and(isNull(sales.paidAt), gte(sales.createdAt, lo), lte(sales.createdAt, hi)),
        ),
      ),
    );

  return { business, rows: rows.filter((sale) => inBusinessRange(settledAt(sale), query, business.tz)) };
}

/** CSV of the owner's paid sales whose business date falls in `[from, to]`. */
export async function exportSalesCsv(db: Db, query: ExportQuery): Promise<string> {
  const { business, rows } = await paidSalesInRange(db, query);
  return salesToCsv(rows, business.tz);
}
