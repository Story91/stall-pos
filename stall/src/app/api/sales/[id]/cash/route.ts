import { db } from "@/db";
import { recordCashPayment } from "@/lib/paypal/invoices";
import { payCash, toResponse } from "@/lib/salesApi";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const result = await payCash(db, { recordCashPayment }, id);
    switch (result.kind) {
      case "paid":
        return Response.json({ status: result.status });
      case "not_found":
        return Response.json({ error: "not_found" }, { status: 404 });
      case "already_paid":
        return Response.json({ error: "already_paid" }, { status: 409 });
      case "not_payable":
        return Response.json({ error: "not_payable" }, { status: 409 });
    }
  } catch (error) {
    return toResponse(error);
  }
}
