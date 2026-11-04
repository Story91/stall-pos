import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { getBusiness } from "@/lib/sales";
import { maskEmail } from "@/lib/sell/format";
import { toResponse } from "@/lib/salesApi";
import { listPayees } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    const business = await getBusiness(db);
    // The screens only show the masked address; the full one never leaves the server.
    const rows = await listPayees(db, business.id);
    return Response.json(rows.map((p) => ({ ...p, email: maskEmail(p.email) })));
  } catch (error) {
    return toResponse(error);
  }
}
