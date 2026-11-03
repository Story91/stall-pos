import { db } from "@/db";
import { parseTranscript, readJson, toResponse } from "@/lib/salesApi";

export async function POST(request: Request): Promise<Response> {
  try {
    return Response.json(await parseTranscript(db, await readJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}
