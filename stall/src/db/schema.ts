import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { Line } from "@/lib/money";

export const saleStatus = pgEnum("sale_status", [
  "draft",
  "awaiting",
  "paid",
  "paid_cash",
  "cancelled",
]);
export const payeeRole = pgEnum("payee_role", ["helper", "supplier"]);
export const billStatus = pgEnum("bill_status", [
  "open",
  "paid",
  "held",
  "declined",
]);
export const payoutStatus = pgEnum("payout_status", [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "UNCLAIMED",
]);
export const decisionType = pgEnum("decision_type", [
  "over_limit",
  "duplicate_bill",
  "manual_payee",
  "escalated",
]);
export const decisionStatus = pgEnum("decision_status", [
  "open",
  "approved",
  "declined",
  "marked_paid",
]);

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const businessId = () =>
  uuid("business_id")
    .notNull()
    .references(() => businesses.id);

export const businesses = pgTable("businesses", {
  id: id(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  taxRate: numeric("tax_rate", { precision: 7, scale: 6 }).notNull(),
  tz: text("tz").notNull(),
  ownerPinHash: text("owner_pin_hash").notNull(),
  createdAt: createdAt(),
});

export const catalogItems = pgTable("catalog_items", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  aliases: text("aliases")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  defaultPriceCents: integer("default_price_cents"),
  lastSeenPriceCents: integer("last_seen_price_cents"),
  taxable: boolean("taxable").notNull().default(true),
  sightings: integer("sightings").notNull().default(0),
  createdAt: createdAt(),
});

export const sales = pgTable("sales", {
  id: id(),
  businessId: businessId(),
  draftId: text("draft_id").notNull().unique(),
  invoiceId: text("invoice_id").unique(),
  invoiceNumber: text("invoice_number"),
  status: saleStatus("status").notNull().default("draft"),
  lines: jsonb("lines").$type<Line[]>().notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull(),
  tipCents: integer("tip_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  language: text("language").notNull().default("en"),
  transcript: text("transcript"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const payees = pgTable("payees", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: payeeRole("role").notNull(),
  dailyRateCents: integer("daily_rate_cents"),
  maxPerDayCents: integer("max_per_day_cents").notNull(),
  autoPay: boolean("auto_pay").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
});

export const shifts = pgTable(
  "shifts",
  {
    id: id(),
    businessId: businessId(),
    payeeId: uuid("payee_id")
      .notNull()
      .references(() => payees.id),
    date: text("date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("shifts_payee_id_date_unique").on(t.payeeId, t.date)],
);

export const bills = pgTable("bills", {
  id: id(),
  businessId: businessId(),
  payeeId: uuid("payee_id")
    .notNull()
    .references(() => payees.id),
  amountCents: integer("amount_cents").notNull(),
  note: text("note").notNull(),
  photoUrl: text("photo_url"),
  date: text("date").notNull(),
  status: billStatus("status").notNull().default("open"),
  createdAt: createdAt(),
});

export const payouts = pgTable("payouts", {
  id: id(),
  businessId: businessId(),
  shiftId: uuid("shift_id")
    .references(() => shifts.id)
    .unique(),
  billId: uuid("bill_id")
    .references(() => bills.id)
    .unique(),
  batchId: text("batch_id").notNull().unique(),
  itemId: text("item_id"),
  amountCents: integer("amount_cents").notNull(),
  status: payoutStatus("status").notNull().default("PENDING"),
  rationale: text("rationale").notNull(),
  createdAt: createdAt(),
});

export const decisions = pgTable("decisions", {
  id: id(),
  businessId: businessId(),
  date: text("date").notNull(),
  type: decisionType("type").notNull(),
  reason: text("reason").notNull(),
  source: jsonb("source").$type<Record<string, unknown>>().notNull(),
  status: decisionStatus("status").notNull().default("open"),
  shiftId: uuid("shift_id").references(() => shifts.id),
  billId: uuid("bill_id").references(() => bills.id),
  createdAt: createdAt(),
});

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    businessId: businessId(),
    date: text("date").notNull(),
    summary: text("summary").notNull(),
    log: jsonb("log").$type<unknown[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("agent_runs_business_id_date_unique").on(t.businessId, t.date)],
);

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
});

export type Business = typeof businesses.$inferSelect;
export type CatalogItem = typeof catalogItems.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type Payee = typeof payees.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
