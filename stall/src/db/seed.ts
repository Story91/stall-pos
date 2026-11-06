import { createHash } from "node:crypto";
import { obligationBatchId } from "@/lib/close/batchId";
import { businessDate, daysAgo, zonedTime } from "@/lib/dates";
import { computeTotals, type Line } from "@/lib/money";
import type { Db } from "./index";
import {
  agentRuns,
  bills,
  businesses,
  catalogItems,
  decisions,
  payees,
  payouts,
  sales,
  shifts,
  webhookEvents,
} from "./schema";
import { CATALOG, SALE_COMBOS, type SaleCombo } from "./seed-data";

const TZ = "America/Chicago";
const TAX_RATE = 0.0825;
const HISTORY_DAYS = 7;

// Service windows in minutes after local midnight: lunch 11:00-14:30, dinner 17:30-21:00.
const LUNCH = [11 * 60, 14 * 60 + 30] as const;
const DINNER = [17 * 60 + 30, 21 * 60] as const;

/** Deterministic pseudo-random number in [0, 1) from integer keys: the same demo every run, no Math.random. */
function noise(...keys: number[]): number {
  let h = 0x9e3779b9;
  for (const key of keys) {
    h = Math.imul(h ^ key, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 2 ** 32;
}

const TOTAL_WEIGHT = SALE_COMBOS.reduce((sum, c) => sum + c.weight, 0);

function pickCombo(r: number): SaleCombo {
  let left = r * TOTAL_WEIGHT;
  for (const combo of SALE_COMBOS) {
    left -= combo.weight;
    if (left < 0) return combo;
  }
  return SALE_COMBOS[SALE_COMBOS.length - 1]!;
}

/**
 * When the day's sales were paid, in order: a lunch rush and a dinner rush, each
 * peaking mid-window (the mean of two draws), at local Chicago time. Today leans
 * on lunch, so an afternoon visit already shows most of today's sales.
 */
function saleTimes(date: string, ago: number, count: number): Date[] {
  const lunchShare = ago === 0 ? 0.75 : 0.58;
  const times: Date[] = [];
  for (let i = 0; i < count; i++) {
    const [start, end] = noise(ago, i, 1) < lunchShare ? LUNCH : DINNER;
    const minute = start + ((noise(ago, i, 2) + noise(ago, i, 3)) / 2) * (end - start);
    const at = zonedTime(date, Math.floor(minute), TZ);
    times.push(new Date(at.getTime() + Math.floor(noise(ago, i, 4) * 60) * 1000));
  }
  return times.sort((a, b) => a.getTime() - b.getTime());
}

/** Past days: 20-30 sales, plus a few more on Friday and Saturday. Today: 8-10, of which only those paid by now are kept. */
function salesOn(date: string, ago: number): number {
  if (ago === 0) return 8 + Math.floor(noise(ago, 99) * 3);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekend = weekday === 5 || weekday === 6 ? 5 : 0;
  return 20 + Math.floor(noise(ago, 99) * 11) + weekend;
}

export async function seed(
  db: Db,
  options: { now?: Date } = {},
): Promise<{ businessId: string; payees: { maria: string; rosa: string } }> {
  const now = options.now ?? new Date();
  const today = businessDate(now, TZ);

  return db.transaction(async (tx) => {
    // Clear in dependency order so the seed can be re-run.
    await tx.delete(webhookEvents);
    await tx.delete(agentRuns);
    await tx.delete(decisions);
    await tx.delete(payouts);
    await tx.delete(bills);
    await tx.delete(shifts);
    await tx.delete(sales);
    await tx.delete(catalogItems);
    await tx.delete(payees);
    await tx.delete(businesses);

    const [business] = await tx
      .insert(businesses)
      .values({
        name: "La Esquina",
        currency: "USD",
        taxRate: String(TAX_RATE),
        tz: TZ,
        ownerPinHash: createHash("sha256").update("1234").digest("hex"),
      })
      .returning({ id: businesses.id });
    const businessId = business!.id;

    await tx.insert(catalogItems).values(
      CATALOG.map((item) => ({
        businessId,
        name: item.name,
        aliases: item.aliases,
        defaultPriceCents: item.priceCents,
        taxable: true,
        sightings: 0,
      })),
    );

    const [maria, rosa] = await tx
      .insert(payees)
      .values([
        {
          businessId,
          name: "Maria",
          email: process.env.SANDBOX_MARIA_EMAIL || "maria@stall.example",
          role: "helper" as const,
          dailyRateCents: 12000,
          maxPerDayCents: 15000,
          autoPay: true,
        },
        {
          businessId,
          name: "Tortillería Rosa",
          email: process.env.SANDBOX_ROSA_EMAIL || "rosa@stall.example",
          role: "supplier" as const,
          dailyRateCents: null,
          // Above her usual $240 tortilla bill, so the daily limit never blocks a real one.
          maxPerDayCents: 30000,
          autoPay: false,
        },
      ])
      .returning({ id: payees.id });

    await tx
      .insert(shifts)
      .values({ businessId, payeeId: maria!.id, date: today });

    const [paidBill] = await tx
      .insert(bills)
      .values({
        businessId,
        payeeId: rosa!.id,
        amountCents: 24000,
        note: "tortillas",
        date: daysAgo(today, 2),
        status: "paid",
      })
      .returning({ id: bills.id });
    await tx.insert(payouts).values({
      businessId,
      billId: paidBill!.id,
      batchId: obligationBatchId(businessId, "bill", paidBill!.id),
      amountCents: 24000,
      status: "SUCCESS",
      rationale: "Tortillas",
      // Sent two days ago, with the bill: History and the daily limits must not count it as today's.
      createdAt: new Date(now.getTime() - 2 * 86_400_000),
    });
    await tx.insert(bills).values({
      businessId,
      payeeId: rosa!.id,
      amountCents: 24000,
      note: "tortillas",
      date: today,
      status: "open",
    });

    // History: a believable week of a taco truck (20-35 paid sales a day across lunch and
    // dinner, about 30% cash, some tips), then today's sales so far: only those already paid
    // by now, so a reset early in the morning leaves today's sales empty rather than in the future.
    const priceByName = new Map(CATALOG.map((c) => [c.name, c.priceCents]));
    const history: (typeof sales.$inferInsert)[] = [];
    let n = 0;
    for (let ago = HISTORY_DAYS; ago >= 0; ago--) {
      const date = daysAgo(today, ago);
      for (const paidAt of saleTimes(date, ago, salesOn(date, ago))) {
        if (paidAt.getTime() > now.getTime()) continue;
        n++;
        const combo = pickCombo(noise(n, 5));
        const cash = noise(n, 6) < 0.3;
        // Tips only come with PayPal: the tip is a line on the invoice.
        const tipPct = !cash && noise(n, 7) < 0.3 ? ([15, 18, 20] as const)[Math.floor(noise(n, 8) * 3)]! : null;
        const language = noise(n, 9) < 0.35 ? "es" : "en";
        const lines: Line[] = combo.items.map(([name, qty]) => ({
          name,
          qty,
          unitCents: priceByName.get(name)!,
          taxable: true,
        }));
        const totals = computeTotals(lines, TAX_RATE, tipPct);
        const draftId = `seed-draft-${n}`;
        history.push({
          businessId,
          draftId,
          invoiceId: `INV2-SEED-${n}`,
          // Same shape as a real Stall invoice number (lib/sales.ts), so the demo history reads like real days.
          invoiceNumber: `STALL-${date.replaceAll("-", "")}-${createHash("sha256").update(draftId).digest("hex").slice(0, 6).toUpperCase()}`,
          status: cash ? "paid_cash" : "paid",
          lines,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          tipCents: totals.tipCents,
          totalCents: totals.totalCents,
          language,
          transcript: language === "es" ? combo.es : combo.en,
          createdAt: new Date(paidAt.getTime() - 2 * 60_000),
          paidAt,
        });
      }
    }
    if (history.length > 0) await tx.insert(sales).values(history);

    return { businessId, payees: { maria: maria!.id, rosa: rosa!.id } };
  });
}
