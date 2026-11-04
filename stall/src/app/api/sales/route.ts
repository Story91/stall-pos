import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { createSale, invoiceDeps, readJson, toResponse } from "@/lib/salesApi";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOwner(request); // the proxy checks too; this keeps the route safe on its own
    const body = await readJson(request);
    const result = await createSale(
      db,
      { invoices: invoiceDeps().invoices },
      body,
    );
    return Response.json(result);
  } catch (error) {
    return toResponse(error);
  }
}
