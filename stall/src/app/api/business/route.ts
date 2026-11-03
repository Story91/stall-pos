import { db } from "@/db";
import { getBusiness } from "@/lib/sales";

// Read per request: never prerendered at build time (no database there).
export const dynamic = "force-dynamic";

/** What the sell screen needs to preview totals; the server still computes the charged amount. */
export async function GET(): Promise<Response> {
  const business = await getBusiness(db);
  return Response.json({
    name: business.name,
    taxRate: Number(business.taxRate),
    currency: business.currency,
  });
}
