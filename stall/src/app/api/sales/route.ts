import { db } from "@/db";
import { createAndSendInvoice, generateQr } from "@/lib/paypal/invoices";
import { createSale, readJson, toResponse } from "@/lib/salesApi";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    const result = await createSale(
      db,
      { invoices: { createAndSendInvoice, generateQr } },
      body,
    );
    return Response.json(result);
  } catch (error) {
    return toResponse(error);
  }
}
