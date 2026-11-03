import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { decide } from "@/lib/closeApi";
import { createPayout } from "@/lib/paypal/payouts";
import { readJson, toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireOwner(request);
    const { id } = await context.params;
    return Response.json(await decide(db, { createPayout }, id, await readJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}
