import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import { E2E_KIOSK_ID, E2E_KIOSK_KEY } from "../../playwright.config";
import { PNG_1PX, TEXT_FILE, makePdf } from "../fixtures";

const kioskHeaders = { authorization: `Bearer ${E2E_KIOSK_KEY}`, "x-kiosk-id": E2E_KIOSK_ID };
const rupiah = (n: string) => new RegExp(`Rp\\s?${n.replace(".", "\\.")}`);

async function uploadFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.getByTestId("file-input").setInputFiles(files);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page should not scroll sideways").toBeLessThanOrEqual(1);
}

async function kioskLookup(request: APIRequestContext, code: string) {
  return request.post("/api/kiosk/lookup", { headers: kioskHeaders, data: { code } });
}

test("homepage shows the main call to action and explains the service", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Print anywhere");
  const cta = page.getByRole("link", { name: "START PRINTING", exact: true }).first();
  await expect(cta).toBeInViewport();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByText("Supported files")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await cta.click();
  await expect(page).toHaveURL(/\/print$/);
  await expect(page.getByRole("heading", { name: "Upload your documents" })).toBeVisible();
});

test("full journey: upload → settings → price → demo payment → code → kiosk prints once", async ({ page, request }) => {
  // 1–2. Upload a 5-page PDF and a PNG.
  await page.goto("/print");
  await uploadFiles(page, [
    { name: "Thesis_Final_Chapter_Draft_Version_2_Revised.pdf", mimeType: "application/pdf", buffer: Buffer.from(await makePdf(5)) },
    { name: "poster.png", mimeType: "image/png", buffer: Buffer.from(PNG_1PX) },
  ]);
  const rows = page.getByTestId("file-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(rows.nth(1)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(rows.nth(0)).toContainText("5 pages");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Continue" }).click();

  // 5–9. Configure: PDF → color, 2 copies, pages 1-2,4. PNG stays B&W × 1.
  await expect(page.getByRole("heading", { name: "Print settings" })).toBeVisible();
  const cards = page.getByTestId("settings-card");
  await expect(cards).toHaveCount(2);
  const total = page.getByTestId("order-total");
  await expect(total).toHaveText(rupiah("3.000")); // 5×500 + 1×500

  const pdfCard = cards.nth(0);
  await pdfCard.getByText("Color", { exact: true }).click();
  await expect(total).toHaveText(rupiah("8.000")); // 5×1500 + 500
  await pdfCard.getByRole("button", { name: "More copies" }).click();
  await expect(total).toHaveText(rupiah("15.500")); // 10×1500 + 500
  await pdfCard.getByText("Choose pages").click();
  const range = pdfCard.getByLabel(/Pages to print/);
  await range.fill("9");
  await expect(pdfCard.getByRole("alert")).toContainText("doesn't exist");
  await expect(page.getByRole("button", { name: "Review" })).toBeDisabled();
  await range.fill("1-2, 4");
  await expect(pdfCard.getByTestId("line-summary")).toContainText("3 pages × 2 copies = 6 printed");
  await expect(total).toHaveText(rupiah("9.500")); // 6×1500 + 500
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Review" }).click();

  // Review and create the order.
  await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
  await expect(page.getByTestId("review-line")).toHaveCount(2);
  await expect(page.getByTestId("review-line").first()).toContainText("1-2,4");
  await page.getByRole("button", { name: "Continue to payment" }).click();

  // 10. Demo payment page.
  await expect(page).toHaveURL(/\/pay\//);
  const orderId = page.url().split("/pay/")[1];
  await expect(page.getByTestId("demo-banner")).toHaveText(/DEMO PAYMENT — NOT A REAL TRANSACTION/);
  await expect(page.getByTestId("pay-amount")).toHaveText(rupiah("9.500"));
  await expectNoHorizontalScroll(page);

  // Opening the payment page must NOT mark the order paid.
  await page.reload();
  await expect(page).toHaveURL(/\/pay\//);
  await page.goto(`/order/${orderId}`);
  await expect(page).toHaveURL(new RegExp(`/pay/${orderId}`)); // unpaid → sent back to pay

  await page.getByRole("button", { name: "SIMULATE SUCCESSFUL PAYMENT" }).click();

  // 11. Confirmation with code.
  await expect(page).toHaveURL(new RegExp(`/order/${orderId}`));
  await expect(page.getByRole("heading", { name: "Payment successful!" })).toBeVisible();
  const codeEl = page.getByTestId("collection-code");
  await expect(codeEl).toBeVisible();
  const code = (await codeEl.getAttribute("data-code"))!;
  expect(code).toMatch(/^PN\d{6}$/);
  await expect(page.getByText("Select “COLLECTION CODE”")).toBeVisible();
  await expect(page.getByTestId("summary-total")).toHaveText(rupiah("9.500"));
  await expectNoHorizontalScroll(page);

  // 13–14. Kiosk retrieves the right order, files and settings.
  const lookup = await kioskLookup(request, code);
  expect(lookup.status()).toBe(200);
  const { order } = await lookup.json();
  expect(order).toMatchObject({ orderId, status: "PAID", totalPrice: 9500, totalPrintedPages: 7 });
  expect(order.files).toHaveLength(2);
  expect(order.files[0]).toMatchObject({
    name: "Thesis_Final_Chapter_Draft_Version_2_Revised.pdf",
    format: "PDF",
    pageCount: 5,
    settings: { paperSize: "A4", colorMode: "COLOR", copies: 2, pages: "1-2,4", selectedPageCount: 3, printedPages: 6 },
  });
  expect(order.files[1]).toMatchObject({ name: "poster.png", format: "PNG", settings: { colorMode: "BW", copies: 1, pages: "all" } });

  const claim = await request.post(`/api/kiosk/orders/${orderId}/claim`, { headers: kioskHeaders, data: { code } });
  expect(claim.status()).toBe(200);
  const download = await request.get(order.files[0].downloadPath, { headers: kioskHeaders });
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("application/pdf");
  expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const complete = await request.post(`/api/kiosk/orders/${orderId}/complete`, { headers: kioskHeaders });
  expect(complete.status()).toBe(200);

  // 15. Can't be printed again; customer sees it's done.
  const again = await kioskLookup(request, code);
  expect(again.status()).toBe(409);
  expect((await again.json()).error.code).toBe("ALREADY_COMPLETED");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Printed. Thank you!" })).toBeVisible();
  await expect(page.getByTestId("collection-code")).toHaveCount(0);
});

test("3–4. unsupported and oversized files are rejected with clear messages", async ({ page }) => {
  await page.goto("/print");
  await uploadFiles(page, [
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from(TEXT_FILE) },
    { name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(21 * 1024 * 1024, 0x25) },
    // Disguised: .pdf extension but not really a PDF → caught by the server.
    { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from(TEXT_FILE) },
  ]);
  const rows = page.getByTestId("file-row");
  await expect(rows.nth(0)).toHaveAttribute("data-status", "error");
  await expect(rows.nth(0)).toContainText("isn't supported");
  await expect(rows.nth(1)).toHaveAttribute("data-status", "error");
  await expect(rows.nth(1)).toContainText("maximum is 20.0 MB");
  await expect(rows.nth(2)).toHaveAttribute("data-status", "error", { timeout: 20_000 });
  await expect(rows.nth(2)).toContainText("isn't supported");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await expect(page.getByText("Remove or replace files with problems.")).toBeVisible();

  // Removing the bad files and adding a good one lets the customer continue.
  for (let i = 0; i < 3; i++) await rows.first().getByRole("button", { name: "Remove" }).click();
  await uploadFiles(page, [{ name: "ok.png", mimeType: "image/png", buffer: Buffer.from(PNG_1PX) }]);
  await expect(rows.first()).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("12. unpaid orders have no usable code, and other browsers can't open the order", async ({ page, request, browser }) => {
  await page.goto("/print");
  await uploadFiles(page, [{ name: "a.png", mimeType: "image/png", buffer: Buffer.from(PNG_1PX) }]);
  await expect(page.getByTestId("file-row").first()).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL(/\/pay\//);
  const orderId = page.url().split("/pay/")[1];

  // The customer API never exposes a code for an unpaid order.
  const res = await page.request.get(`/api/orders/${orderId}`);
  expect((await res.json()).order).toMatchObject({ status: "PENDING_PAYMENT", collectionCode: null });

  // A different browser (no order cookie) can't see or pay the order.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(`/pay/${orderId}`);
  await expect(otherPage.getByRole("heading", { name: "Order not found" })).toBeVisible();
  const steal = await otherPage.request.post(`/api/orders/${orderId}/pay`);
  expect(steal.status()).toBe(404);
  await other.close();

  // Kiosk API rejects requests without valid credentials.
  const noAuth = await request.post("/api/kiosk/lookup", { data: { code: "PN123456" } });
  expect(noAuth.status()).toBe(401);
});

test("help page answers the key questions", async ({ page }) => {
  await page.goto("/help");
  for (const q of ["Which file types can I print?", "How does payment work?", "My collection code doesn’t work. What should I do?"]) {
    await expect(page.getByText(q)).toBeVisible();
  }
  await page.getByText("How does payment work?").click();
  await expect(page.getByText("No real money is taken")).toBeVisible();
  await expectNoHorizontalScroll(page);
});
