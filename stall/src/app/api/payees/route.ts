import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { getBusiness } from "@/lib/sales";
import { toResponse } from "@/lib/salesApi";
import { listPayees } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    const business = await getBusiness(db);
    return Response.json(await listPayees(db, business.id));
  } catch (error) {
    return toResponse(error);
  }
}
