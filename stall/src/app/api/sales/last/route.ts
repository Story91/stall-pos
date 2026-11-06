import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { lastSale, toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

/** Today's newest charged sale, for "cancel that sale". `{ sale: null }` when there is none. */
export async function GET(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    return Response.json({ sale: await lastSale(db) });
  } catch (error) {
    return toResponse(error);
  }
}
