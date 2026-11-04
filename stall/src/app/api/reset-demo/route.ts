import { db } from "@/db";
import { seed } from "@/db/seed";
import { requireOwner } from "@/lib/auth";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

/** Wipes the business data and reseeds the demo day, so a judge can start over. */
export async function POST(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    await seed(db);
    return Response.json({ ok: true });
  } catch (error) {
    return toResponse(error);
  }
}
