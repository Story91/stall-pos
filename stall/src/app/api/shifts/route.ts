import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { deleteShift, postShift } from "@/lib/closeApi";
import { readJson, toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    return Response.json(await postShift(db, await readJson(request)));
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    const params = new URL(request.url).searchParams;
    return Response.json(
      await deleteShift(db, { payeeId: params.get("payeeId"), date: params.get("date") }),
    );
  } catch (error) {
    return toResponse(error);
  }
}
