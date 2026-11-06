import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { closeViewQuery } from "@/lib/closeApi";
import { exportQuery } from "@/lib/export";
import { historyFor } from "@/lib/history";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

/**
 * Paid sales and payouts between two business dates (inclusive), newest first, with totals.
 * `?language=en|es|pl` (default en) words the payout reasons for the owner.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = exportQuery.parse(params);
    const { language } = closeViewQuery.parse(params);
    return Response.json(await historyFor(db, query, language));
  } catch (error) {
    return toResponse(error);
  }
}
