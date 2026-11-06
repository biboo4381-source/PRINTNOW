import { type APIRequestContext, type Browser, type Page, devices, expect, request as playwrightRequest, test } from "@playwright/test";
import { E2E_KIOSK_ID, E2E_KIOSK_KEY } from "../../playwright.config";
import { makePdf } from "../fixtures";
import { quadrantPng } from "../png";

const kioskHeaders = { authorization: `Bearer ${E2E_KIOSK_KEY}`, "x-kiosk-id": E2E_KIOSK_ID };

/** Creates and pays an order through the customer API (like a phone would). Returns the code. */
async function paidOrderViaApi(
  baseURL: string,
  file: { name: string; type: string; bytes: Buffer },
  item: Record<string, unknown> = {},
): Promise<{ code: string; orderId: string; customer: APIRequestContext }> {
  const customer = await playwrightRequest.newContext({ baseURL });
  const up = await customer.post("/api/uploads/local", { multipart: { file: { name: file.name, mimeType: file.type, buffer: file.bytes } } });
  const { pathname } = await up.json();
  const verified = await (await customer.post("/api/files/verify", { data: { pathname, name: file.name } })).json();
  const created = await customer.post("/api/orders", {
    data: { item: { fileId: verified.file.id, colorMode: "BW", copies: 1, pageSelection: "all", ...item } },
  });
  expect(created.status()).toBe(201);
  const { orderId } = await created.json();
  const paid = await (await customer.post(`/api/orders/${orderId}/pay`)).json();
  return { code: paid.collectionCode, orderId, customer };
}

async function pair(page: Page, screen: string | RegExp = "home") {
  await page.goto("/kiosk");
  await expect(page).toHaveURL(/\/kiosk\/setup$/);
  await page.getByLabel("Kiosk ID").fill(E2E_KIOSK_ID);
  await page.getByLabel("Kiosk key").fill(E2E_KIOSK_KEY);
  await page.getByRole("button", { name: "Pair this device" }).click();
  await expect(page.getByTestId("kiosk")).toHaveAttribute("data-screen", screen, { timeout: 15_000 });
}

async function enterCode(page: Page, code: string) {
  await page.getByRole("button", { name: /COLLECTION CODE/ }).click();
  await expect(page.getByTestId("kiosk")).toHaveAttribute("data-screen", "code");
  for (const d of code.replace(/^PN/, "")) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Confirm code" }).click();
}

async function kioskStatus(request: APIRequestContext, code: string) {
  const res = await request.post("/api/kiosk/lookup", { headers: kioskHeaders, data: { code } });
  return res.ok() ? (await res.json()).order.status : (await res.json()).error.code;
}

async function expectNoScroll(page: Page) {
  const o = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(o.x, "no sideways scroll").toBeLessThanOrEqual(1);
  expect(o.y, "kiosk screens fit without scrolling").toBeLessThanOrEqual(1);
}

async function longPress(page: Page, testId: string) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2300);
  await page.mouse.up();
}

test.describe("kiosk", () => {
  test("an unpaired device can't use the kiosk; pairing requires the right key", async ({ page, request }) => {
    expect((await request.post("/kiosk/api/lookup", { data: { code: "PN123456" } })).status()).toBe(401);
    await page.goto("/kiosk");
    await expect(page).toHaveURL(/\/kiosk\/setup$/);
    await page.getByLabel("Kiosk ID").fill(E2E_KIOSK_ID);
    await page.getByLabel("Kiosk key").fill("wrong-key");
    await page.getByRole("button", { name: "Pair this device" }).click();
    await expect(page.getByText("Kiosk ID or key is incorrect.")).toBeVisible();
    // The key is not kept in the browser.
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "pn_kiosk")).toBeUndefined();
  });

  test("home and UPLOAD FILE: permanent QR code to the website, back to home", async ({ page }) => {
    await pair(page);
    const cookie = (await page.context().cookies()).find((c) => c.name === "pn_kiosk")!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict" });
    expect(cookie.value).not.toContain(E2E_KIOSK_KEY);
    await expect(page.getByRole("button", { name: /UPLOAD FILE/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /COLLECTION CODE/ })).toBeVisible();
    await expect(page.getByTestId("simulation-badge")).toBeVisible();
    await expectNoScroll(page);

    await page.getByRole("button", { name: /UPLOAD FILE/ }).click();
    const qr = page.getByTestId("upload-qr");
    await expect(qr).toHaveAttribute("aria-label", "QR code linking to https://printnow-web.vercel.app/print");
    await expect(qr.locator("svg")).toBeVisible();
    await expect(page.getByText("Scan the QR code with your phone camera")).toBeVisible();
    await expectNoScroll(page);
    // Same QR every time (no sessions).
    const first = await qr.innerHTML();
    await page.reload();
    await page.getByRole("button", { name: /UPLOAD FILE/ }).click();
    expect(await page.getByTestId("upload-qr").innerHTML()).toBe(first);
    await page.getByRole("button", { name: "Back to home" }).click();
    await expect(page.getByTestId("kiosk")).toHaveAttribute("data-screen", "home");

    // Laptops: the staff menu also opens with Ctrl + Alt + K.
    await page.keyboard.press("Control+Alt+KeyK");
    await expect(page.getByRole("dialog", { name: "Staff menu" })).toBeVisible();
    await page.getByRole("button", { name: "Close staff menu" }).click();
    await expect(page.getByRole("dialog", { name: "Staff menu" })).toBeHidden();
  });

  test("full journey: order on a phone → code at the kiosk → confirm → simulated print → completed", async ({ page, browser, request }) => {
    // 1. Customer orders on their phone (real website UI).
    const phone = await (browser as Browser).newContext({ ...devices["Pixel 7"] });
    const p = await phone.newPage();
    await p.goto("/print");
    await p.getByTestId("file-input").setInputFiles({ name: "Assignment.pdf", mimeType: "application/pdf", buffer: Buffer.from(await makePdf(5)) });
    await expect(p.getByTestId("file-row")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await p.getByRole("button", { name: "Continue", exact: true }).click();
    await p.getByText("Choose pages", { exact: true }).click();
    await p.getByLabel(/Tap pages below/).fill("1-3");
    await p.getByRole("button", { name: "Continue to settings" }).click();
    await p.getByText("Color", { exact: true }).click();
    await p.getByRole("button", { name: "More copies" }).click();
    await p.getByRole("button", { name: "Go to payment" }).click();
    await p.getByRole("button", { name: "SIMULATE SUCCESSFUL PAYMENT" }).click();
    const code = (await p.getByTestId("collection-code").getAttribute("data-code"))!;
    const orderUrl = p.url();

    // 2. At the kiosk.
    await pair(page);
    await enterCode(page, code);
    const confirm = page.getByTestId("kiosk-confirm");
    await expect(confirm).toBeVisible();
    await expect(page.getByTestId("confirm-name")).toHaveText("Assignment.pdf");
    await expect(confirm).toContainText("Format: PDF");
    await expect(confirm).toContainText("5 pages in document");
    const details = page.getByTestId("confirm-details");
    await expect(details).toContainText("Color");
    await expect(details).toContainText("Copies2");
    await expect(details).toContainText("Selected pages1-3");
    await expect(details).toContainText("Total sheets to print6");
    await expect(details).toContainText(/Rp\s?9\.000/);
    await expectNoScroll(page);
    expect(await kioskStatus(request, code)).toBe("PAID"); // looking doesn't change anything

    await page.getByRole("button", { name: /CONFIRM & PRINT/ }).click();
    const printing = page.getByTestId("kiosk-printing");
    await expect(printing).toBeVisible();
    await expect(printing).toContainText("SIMULATED PRINTING");
    await expect(page.getByTestId("print-progress")).toContainText(/Sheet \d of 6/, { timeout: 15_000 });
    await expect(page.getByTestId("print-preview")).not.toHaveAttribute("data-page", "0"); // real document rendered
    expect(await kioskStatus(request, code)).toBe("ALREADY_PROCESSING"); // locked while printing
    await expectNoScroll(page);

    await expect(page.getByTestId("kiosk-done")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("kiosk-done")).toContainText("6 sheets");
    await expect(page.getByTestId("kiosk-done")).toContainText("Simulated print");

    // 3. Order is completed everywhere and can't be printed again.
    expect(await kioskStatus(request, code)).toBe("ALREADY_COMPLETED");
    await p.goto(orderUrl);
    await expect(p.getByRole("heading", { name: "Printed. Thank you!" })).toBeVisible();
    await phone.close();

    await page.getByRole("button", { name: /Done/ }).click();
    await expect(page.getByTestId("kiosk")).toHaveAttribute("data-screen", "home");
    await enterCode(page, code);
    await expect(page.getByTestId("kiosk-message")).toHaveAttribute("data-code", "ALREADY_COMPLETED");
    await expect(page.getByText("Already printed")).toBeVisible();
  });

  test("keypad: delete, clear, wrong code keeps digits for correction; cancel leaves the order untouched", async ({ page, baseURL, request }) => {
    const { code } = await paidOrderViaApi(baseURL!, { name: "photo.png", type: "image/png", bytes: quadrantPng(200, 150) });
    await pair(page);
    await page.getByRole("button", { name: /COLLECTION CODE/ }).click();
    const display = page.getByTestId("code-display");
    for (const d of "123") await page.getByRole("button", { name: d, exact: true }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(display).toHaveAttribute("aria-label", "Code PN 1 2");
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByRole("button", { name: "Confirm code" })).toBeDisabled();

    // Wrong code → message → Try again keeps the digits.
    for (const d of "999999") await page.getByRole("button", { name: d, exact: true }).click();
    await page.getByRole("button", { name: "Confirm code" }).click();
    await expect(page.getByTestId("kiosk-message")).toHaveAttribute("data-code", "INVALID_CODE");
    await expect(page.getByText("Code not found")).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(display).toHaveAttribute("aria-label", "Code PN 9 9 9 9 9 9");
    await page.getByRole("button", { name: "Clear" }).click();

    // Physical keyboard works too.
    await page.keyboard.type(code.slice(2));
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("kiosk-confirm")).toBeVisible();
    await expect(page.getByTestId("confirm-details")).toContainText("1 (photo on A4)");
    await page.getByRole("button", { name: /CANCEL \/ BACK/ }).click();
    await expect(page.getByTestId("kiosk")).toHaveAttribute("data-screen", "code");
    expect(await kioskStatus(request, code)).toBe("PAID");
  });

  test("simulated paper jam: order goes back to PAID and the same code prints on retry", async ({ page, baseURL, request }) => {
    const { code } = await paidOrderViaApi(baseURL!, { name: "report.pdf", type: "application/pdf", bytes: Buffer.from(await makePdf(3)) });
    await pair(page);
    await longPress(page, "kiosk-logo");
    await expect(page.getByRole("dialog", { name: "Staff menu" })).toBeVisible();
    await page.getByLabel("Simulate a paper jam on the next print").check();
    await page.getByRole("button", { name: "Close staff menu" }).click();

    await enterCode(page, code);
    await page.getByRole("button", { name: /CONFIRM & PRINT/ }).click();
    await expect(page.getByTestId("kiosk-failed")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("kiosk-failed")).toContainText("Your code still works");
    expect(await kioskStatus(request, code)).toBe("PAID");

    await page.getByRole("button", { name: /Home/ }).click();
    await enterCode(page, code);
    await page.getByRole("button", { name: /CONFIRM & PRINT/ }).click();
    await expect(page.getByTestId("kiosk-done")).toBeVisible({ timeout: 30_000 });
    expect(await kioskStatus(request, code)).toBe("ALREADY_COMPLETED");
  });

  test("two kiosks can't print the same order", async ({ page, browser, baseURL, viewport, hasTouch, isMobile }) => {
    const { code } = await paidOrderViaApi(baseURL!, { name: "long.pdf", type: "application/pdf", bytes: Buffer.from(await makePdf(4)) }, { copies: 3 });
    await pair(page);
    const second = await (browser as Browser).newContext({ viewport, hasTouch, isMobile });
    const k2 = await second.newPage();
    await pair(k2);

    await enterCode(page, code);
    await enterCode(k2, code);
    await expect(page.getByTestId("kiosk-confirm")).toBeVisible();
    await expect(k2.getByTestId("kiosk-confirm")).toBeVisible();
    await page.getByRole("button", { name: /CONFIRM & PRINT/ }).click();
    await expect(page.getByTestId("kiosk-printing")).toBeVisible();
    await expect(page.getByTestId("print-progress")).toContainText("Sheet", { timeout: 15_000 });
    await k2.getByRole("button", { name: /CONFIRM & PRINT/ }).click();
    await expect(k2.getByTestId("kiosk-message")).toHaveAttribute("data-code", "ALREADY_PROCESSING");
    await expect(page.getByTestId("kiosk-done")).toBeVisible({ timeout: 30_000 });
    await second.close();
  });

  test("recovery: an order left in PROCESSING is offered to staff and can be released", async ({ page, baseURL, request }) => {
    const { code, orderId } = await paidOrderViaApi(baseURL!, { name: "stuck.pdf", type: "application/pdf", bytes: Buffer.from(await makePdf(1)) });
    // Simulate a kiosk that claimed the order and then lost power.
    expect((await request.post(`/api/kiosk/orders/${orderId}/claim`, { headers: kioskHeaders, data: { code } })).status()).toBe(200);
    // The recovery check runs right after the kiosk opens, so home may or may not show first.
    await pair(page, /^(home|recovery)$/);
    await expect(page.getByTestId("kiosk-recovery")).toBeVisible();
    await expect(page.getByTestId("kiosk-recovery")).toContainText("stuck.pdf");
    await page.getByRole("button", { name: "Release order" }).click();
    await expect(page.getByTestId("kiosk")).toHaveAttribute("data-screen", "home");
    expect(await kioskStatus(request, code)).toBe("PAID");
  });

  test("inactivity returns to the home screen", async ({ page }) => {
    await pair(page);
    await page.goto("/kiosk?idle=4");
    await page.getByRole("button", { name: /COLLECTION CODE/ }).click();
    await page.getByRole("button", { name: "5", exact: true }).click();
    await expect(page.getByText(/Returning to home in \ds/)).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId("kiosk")).toHaveAttribute("data-screen", "home", { timeout: 6_000 });
  });
});
