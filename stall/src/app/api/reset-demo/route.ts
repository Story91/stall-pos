import { db } from "@/db";
import { seed } from "@/db/seed";
import { hasBearerToken, hasCloseKey, requireOwner } from "@/lib/auth";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

/**
 * Wipes the business data and reseeds the demo day, so a judge can start over.
 * Owner cookie (the Settings button), `?key=CLOSE_TRIGGER_KEY`, or `Authorization: Bearer` CRON_SECRET.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!hasCloseKey(request) && !hasBearerToken(request)) requireOwner(request);
    await seed(db);
    return Response.json({ ok: true });
  } catch (error) {
    return toResponse(error);
  }
}

/**
 * Vercel Cron calls its path with GET, shortly after midnight in Chicago, so the hosted
 * demo always has today's shift and bill. Scheduler credentials only: a cookie-authenticated
 * GET that wipes data would be CSRF-able.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    if (!hasCloseKey(request) && !hasBearerToken(request)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    await seed(db);
    return Response.json({ ok: true });
  } catch (error) {
    return toResponse(error);
  }
}
