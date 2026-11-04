import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { readJson, toResponse } from "@/lib/salesApi";
import { businessView, updateBusiness } from "@/lib/settings";

// Read per request: never prerendered at build time (no database there).
export const dynamic = "force-dynamic";

/** What the screens need: name and tax rate for previews, and today's business date. */
export async function GET(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    return Response.json(await businessView(db));
  } catch (error) {
    return toResponse(error);
  }
}

/** Settings: rename the business or change the tax rate (a fraction, 0.0825 = 8.25%). */
export async function PATCH(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    return Response.json(await updateBusiness(db, await readJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}
