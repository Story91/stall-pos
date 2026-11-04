import { db } from "@/db";
import { hasBearerToken, hasCloseKey, requireOwner } from "@/lib/auth";
import { closeDay, readOptionalJson } from "@/lib/closeApi";
import { createPayout } from "@/lib/paypal/payouts";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";
// The close agent makes several model and PayPal calls.
export const maxDuration = 60;

/**
 * Closes a day. Owner cookie, `?key=CLOSE_TRIGGER_KEY`, or `Authorization: Bearer`
 * CRON_SECRET (falling back to CLOSE_TRIGGER_KEY) for the scheduler ping.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!hasCloseKey(request) && !hasBearerToken(request)) requireOwner(request);
    return Response.json(await closeDay(db, { createPayout }, await readOptionalJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}

/** Vercel Cron calls its path with GET. Scheduler credentials only: a cookie-authenticated GET would be CSRF-able. */
export async function GET(request: Request): Promise<Response> {
  try {
    if (!hasCloseKey(request) && !hasBearerToken(request)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return Response.json(await closeDay(db, { createPayout }, undefined));
  } catch (error) {
    return toResponse(error);
  }
}
