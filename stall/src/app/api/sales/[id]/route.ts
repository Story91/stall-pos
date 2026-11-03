import { db } from "@/db";
import { saleStatus } from "@/lib/salesApi";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const status = await saleStatus(db, id);
  if (!status) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(status);
}
