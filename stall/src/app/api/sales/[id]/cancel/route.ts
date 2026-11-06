import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { toResponse, voidDeps, voidSale } from "@/lib/salesApi";

const STATUS: Record<string, number> = {
  not_found: 404,
  already_cancelled: 409,
  paid_paypal: 409,
  changed: 409,
};

/** Cancel a sale: cancels the unpaid PayPal invoice, or records a cash refund. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireOwner(request);
    const { id } = await params;
    const result = await voidSale(db, voidDeps(), id);
    if (result.kind === "cancelled") {
      return Response.json({ status: "cancelled", was: result.was });
    }
    return Response.json({ error: result.kind }, { status: STATUS[result.kind] ?? 409 });
  } catch (error) {
    return toResponse(error);
  }
}
