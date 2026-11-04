import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { parseTranscript, readJson, toResponse } from "@/lib/salesApi";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    return Response.json(await parseTranscript(db, await readJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}
