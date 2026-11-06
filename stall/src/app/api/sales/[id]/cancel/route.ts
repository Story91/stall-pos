import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { cancelSale, invoiceDeps, toResponse } from "@/lib/salesApi";

/** Cancels an unpaid sale and its PayPal invoice; 409 if the customer already paid. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireOwner(request);
    const { id } = await params;
    const { cancelInvoice, getInvoiceStatus } = invoiceDeps();
    const result = await cancelSale(db, { cancelInvoice, getInvoiceStatus }, id);
    switch (result.kind) {
      case "cancelled":
        return Response.json({ status: "cancelled" });
      case "not_found":
        return Response.json({ error: "not_found" }, { status: 404 });
      case "already_paid":
        return Response.json({ error: "already_paid" }, { status: 409 });
    }
  } catch (error) {
    return toResponse(error);
  }
}
