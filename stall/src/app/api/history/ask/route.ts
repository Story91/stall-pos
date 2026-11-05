import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { askHistory } from "@/lib/historyAsk";
import { readJson, toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

/** A spoken or typed question about the ledger, turned into a grid view (filters and sort, never totals). */
export async function POST(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    return Response.json(await askHistory(db, await readJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}
