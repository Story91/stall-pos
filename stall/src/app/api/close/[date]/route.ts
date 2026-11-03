import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { closeViewFor } from "@/lib/closeApi";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ date: string }> },
): Promise<Response> {
  try {
    requireOwner(request);
    const { date } = await context.params;
    return Response.json(await closeViewFor(db, date));
  } catch (error) {
    return toResponse(error);
  }
}
