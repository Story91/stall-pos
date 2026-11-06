import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { closeViewFor } from "@/lib/closeApi";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

/** The close of one day. `?language=en|es|pl` (default en) words it for the owner. */
export async function GET(
  request: Request,
  context: { params: Promise<{ date: string }> },
): Promise<Response> {
  try {
    requireOwner(request);
    const { date } = await context.params;
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await closeViewFor(db, date, query));
  } catch (error) {
    return toResponse(error);
  }
}
