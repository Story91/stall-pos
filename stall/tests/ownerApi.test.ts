import { describe, expect, it } from "vitest";
import { failureText } from "@/lib/owner/api";

describe("failureText", () => {
  it("explains a payout PayPal has but we could not record", () => {
    expect(failureText({ status: 409, code: "payout_exists_unrecorded" })).toBe(
      "PayPal already has a payout for this item that we could not record. Check PayPal, then mark it as already paid.",
    );
  });

  it("explains a payee with no daily rate", () => {
    expect(failureText({ status: 409, code: "no_amount" })).toBe("This payee has no daily rate set.");
  });

  it("explains an amount that changed since the card was shown", () => {
    expect(failureText({ status: 409, code: "amount_changed" })).toBe(
      "The amount changed since this card was shown. Check the new amount and approve again.",
    );
  });

  it("keeps the generic message for unknown codes", () => {
    expect(failureText({ status: 500, code: "server" })).toBe("Something went wrong on the server. Try again.");
  });
});
