import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { parseObligationText } from "@/lib/closeApi";
import { readJson, toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    return Response.json(await parseObligationText(db, await readJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}
