import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { saleStatus, toResponse } from "@/lib/salesApi";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireOwner(request);
    const { id } = await params;
    const status = await saleStatus(db, id);
    if (!status) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(status);
  } catch (error) {
    return toResponse(error);
  }
}
