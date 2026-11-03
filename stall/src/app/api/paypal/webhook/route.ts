import { db } from "@/db";
import { handleWebhookEvent, verifyWebhookSignature, type WebhookEvent } from "@/lib/paypal/webhooks";

export async function POST(request: Request): Promise<Response> {
  // The signature covers the exact bytes, so read the raw text before parsing.
  const raw = await request.text();
  let event: Partial<WebhookEvent> = {};
  try {
    // Local dev only: lets the dashboard simulator (unsigned) through.
    const skipVerify =
      process.env.PAYPAL_WEBHOOK_SKIP_VERIFY === "1" &&
      process.env.NODE_ENV !== "production";
    if (!skipVerify && !(await verifyWebhookSignature(request.headers, raw))) {
      return Response.json({ error: "bad signature" }, { status: 400 });
    }

    try {
      event = JSON.parse(raw) as Partial<WebhookEvent>;
    } catch {
      return Response.json({ error: "bad json" }, { status: 400 });
    }
    if (!event.id || !event.event_type) {
      return Response.json({ error: "bad event" }, { status: 400 });
    }

    const result = await handleWebhookEvent(db, event as WebhookEvent);
    return Response.json({ result });
  } catch {
    // Never log the payload or error body: only the event id and type.
    console.error("webhook failed", { id: event.id, type: event.event_type });
    return Response.json({ error: "webhook" }, { status: 500 });
  }
}
