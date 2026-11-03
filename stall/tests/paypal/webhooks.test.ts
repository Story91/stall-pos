import { describe, expect, it, vi } from "vitest";
import { verifyWebhookSignature } from "@/lib/paypal/webhooks";

const headers = () =>
  new Headers({
    "PAYPAL-AUTH-ALGO": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
    "paypal-transmission-id": "tx-1",
    "paypal-transmission-sig": "sig-1",
    "paypal-transmission-time": "2026-11-07T18:00:05Z",
  });
const body = JSON.stringify({ id: "WH-1", event_type: "INVOICING.INVOICE.PAID" });

describe("verifyWebhookSignature", () => {
  it("posts the transmission headers and returns true on SUCCESS", async () => {
    const fake = vi.fn().mockResolvedValue({ verification_status: "SUCCESS" });
    const ok = await verifyWebhookSignature(headers(), body, {
      paypalFetch: fake,
      webhookId: "WEBHOOK-ID",
    });
    expect(ok).toBe(true);
    expect(fake).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/notifications/verify-webhook-signature",
      body: {
        auth_algo: "SHA256withRSA",
        cert_url: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
        transmission_id: "tx-1",
        transmission_sig: "sig-1",
        transmission_time: "2026-11-07T18:00:05Z",
        webhook_id: "WEBHOOK-ID",
        webhook_event: JSON.parse(body),
      },
    });
  });

  it("returns false on FAILURE", async () => {
    const fake = vi.fn().mockResolvedValue({ verification_status: "FAILURE" });
    expect(
      await verifyWebhookSignature(headers(), body, { paypalFetch: fake, webhookId: "W" }),
    ).toBe(false);
  });

  it("returns false without calling PayPal when a header is missing", async () => {
    const fake = vi.fn();
    const h = headers();
    h.delete("paypal-transmission-sig");
    expect(
      await verifyWebhookSignature(h, body, { paypalFetch: fake, webhookId: "W" }),
    ).toBe(false);
    expect(fake).not.toHaveBeenCalled();
  });
});
