import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { exportQuery } from "@/lib/export";
import { historyFor } from "@/lib/history";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

/** Paid sales and payouts between two business dates (inclusive), newest first, with totals. */
export async function GET(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    const query = exportQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await historyFor(db, query));
  } catch (error) {
    return toResponse(error);
  }
}
