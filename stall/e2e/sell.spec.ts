import { expect, test } from "@playwright/test";

test("owner unlocks, reads an order, charges it and sees the QR", async ({ page }) => {
  // The keypad submits once it knows the PIN length, so wait for that lookup.
  const pinLength = page.waitForResponse(
    (r) => r.url().endsWith("/api/pin") && r.request().method() === "GET",
  );
  await page.goto("/pin");
  await pinLength;
  for (const digit of "1234") {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await expect(page).toHaveURL(/\/sell/);

  await page.getByLabel("Or type the order").fill("two tacos al pastor");
  await page.getByRole("button", { name: "Read order" }).click();

  const order = page.getByRole("region", { name: "Order" });
  await expect(order.getByText("Taco al pastor")).toBeVisible();
  // 2 x $4.50 = $9.00, 8.25% tax = $0.74
  await expect(order.getByRole("button", { name: /Charge \$9\.74/ })).toBeVisible();
  await order.getByRole("button", { name: /Charge/ }).click();

  const payment = page.getByRole("region", { name: "Payment" });
  const qr = payment.getByRole("img", { name: /Scan to pay \$9\.74 with PayPal/ });
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(payment.getByRole("status")).toHaveText(/Waiting for payment/);
});
