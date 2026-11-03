import { db } from "@/db";
import { hasCloseKey, requireOwner } from "@/lib/auth";
import { closeDay, readOptionalJson } from "@/lib/closeApi";
import { createPayout } from "@/lib/paypal/payouts";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";
// The close agent makes several model and PayPal calls.
export const maxDuration = 60;

/** Closes a day. Owner cookie, or `?key=CLOSE_TRIGGER_KEY` for the external scheduler ping. */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!hasCloseKey(request)) requireOwner(request);
    return Response.json(await closeDay(db, { createPayout }, await readOptionalJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}
