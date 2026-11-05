import { createHash } from "node:crypto";
import { obligationBatchId } from "@/lib/close/batchId";
import { businessDate, daysAgo } from "@/lib/dates";
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
import { CATALOG, SALE_COMBOS } from "./seed-data";

const TZ = "America/Chicago";
const TAX_RATE = 0.0825;
const HISTORY_DAYS = 7;

export async function seed(
  db: Db,
): Promise<{ businessId: string; payees: { maria: string; rosa: string } }> {
  const today = businessDate(new Date(), TZ);

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
          maxPerDayCents: 20000,
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
      createdAt: new Date(Date.now() - 2 * 86_400_000),
    });
    await tx.insert(bills).values({
      businessId,
      payeeId: rosa!.id,
      amountCents: 24000,
      note: "tortillas",
      date: today,
      status: "open",
    });

    // History: 3-6 paid sales per past day, cycled deterministically.
    const priceByName = new Map(CATALOG.map((c) => [c.name, c.priceCents]));
    const history: (typeof sales.$inferInsert)[] = [];
    let n = 0;
    for (let ago = 1; ago <= HISTORY_DAYS; ago++) {
      const date = daysAgo(today, ago);
      const count = 3 + (ago % 4);
      for (let i = 0; i < count; i++) {
        n++;
        const combo = SALE_COMBOS[(n * 5 + ago) % SALE_COMBOS.length]!;
        const paidAt = new Date(Date.parse(`${date}T17:00:00Z`) + i * 47 * 60_000);
        const language = n % 3 === 0 ? "es" : "en";
        const lines: Line[] = combo.items.map(([name, qty]) => ({
          name,
          qty,
          unitCents: priceByName.get(name)!,
          taxable: true,
        }));
        const totals = computeTotals(lines, TAX_RATE, null);
        history.push({
          businessId,
          draftId: `seed-draft-${n}`,
          invoiceId: `INV2-SEED-${n}`,
          // Same shape as a real Stall invoice number (lib/sales.ts), so the demo history reads like real days.
          invoiceNumber: `STALL-${date.replaceAll("-", "")}-${(0xa1b2c + n * 7919).toString(16).slice(-6).toUpperCase()}`,
          status: n % 5 === 0 ? "paid_cash" : "paid",
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
    await tx.insert(sales).values(history);

    return { businessId, payees: { maria: maria!.id, rosa: rosa!.id } };
  });
}
