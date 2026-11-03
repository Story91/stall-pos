import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { postBill } from "@/lib/closeApi";
import { readJson, toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    return Response.json(await postBill(db, await readJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}
