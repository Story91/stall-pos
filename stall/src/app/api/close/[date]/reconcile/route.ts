import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { reconcileFor } from "@/lib/closeApi";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

/** The day's ledger checked against PayPal Transaction Search. Read-only. */
export async function GET(request: Request, context: { params: Promise<{ date: string }> }): Promise<Response> {
  try {
    requireOwner(request);
    const { date } = await context.params;
    return Response.json(await reconcileFor(db, date));
  } catch (error) {
    return toResponse(error);
  }
}
