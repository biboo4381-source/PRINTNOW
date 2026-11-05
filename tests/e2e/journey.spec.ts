import path from "node:path";
import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { E2E_KIOSK_ID, E2E_KIOSK_KEY } from "../../playwright.config";
import { JPG_SAMPLE, TEXT_FILE, makePdf } from "../fixtures";
import { quadrantPng } from "../png";

const kioskHeaders = { authorization: `Bearer ${E2E_KIOSK_KEY}`, "x-kiosk-id": E2E_KIOSK_ID };
const rupiah = (n: string) => new RegExp(`Rp\\s?${n.replace(".", "\\.")}`);
const LONG_PDF_NAME = "Thesis_Final_Chapter_Draft_Version_2_Revised.pdf";

async function chooseFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.getByTestId("file-input").setInputFiles(files);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page should not scroll sideways").toBeLessThanOrEqual(1);
}

async function payAndGetCode(page: Page) {
  await page.getByRole("button", { name: "Go to payment" }).click();
  await expect(page).toHaveURL(/\/pay\//, { timeout: 30_000 });
  const orderId = page.url().split("/pay/")[1];
  await expect(page.getByTestId("demo-banner")).toHaveText(/DEMO PAYMENT — NOT A REAL TRANSACTION/);
  await page.getByRole("button", { name: "SIMULATE SUCCESSFUL PAYMENT" }).click();
  await expect(page).toHaveURL(new RegExp(`/order/${orderId}`));
  const code = (await page.getByTestId("collection-code").getAttribute("data-code"))!;
  expect(code).toMatch(/^PN\d{6}$/);
  return { orderId, code };
}

async function kioskClaim(request: APIRequestContext, code: string) {
  const lookup = await request.post("/api/kiosk/lookup", { headers: kioskHeaders, data: { code } });
  expect(lookup.status()).toBe(200);
  const { order } = await lookup.json();
  const claim = await request.post(`/api/kiosk/orders/${order.orderId}/claim`, { headers: kioskHeaders, data: { code } });
  expect(claim.status()).toBe(200);
  return order;
}

type Rgb = [number, number, number];
const PALETTE: Record<string, Rgb> = {
  red: [230, 30, 30],
  green: [30, 180, 60],
  blue: [30, 60, 230],
  yellow: [240, 210, 20],
  white: [255, 255, 255],
};
function classify([r, g, b]: Rgb) {
  let best = "";
  let bestD = Infinity;
  for (const [name, [pr, pg, pb]] of Object.entries(PALETTE)) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) [best, bestD] = [name, d];
  }
  return best;
}
/** Sample points as fractions of the A4 page, inside the printable area. */
const SAMPLES = Array.from({ length: 7 }, (_, j) => Array.from({ length: 5 }, (_, i) => [0.1 + i * 0.2, 0.07 + j * 0.143] as const)).flat();

async function sampleCanvas(page: Page, testId: string): Promise<string[]> {
  const rgbs: Rgb[] = await page.getByTestId(testId).evaluate((el, pts) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    return pts.map(([fx, fy]) => {
      const d = ctx.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data;
      return [d[0], d[1], d[2]] as [number, number, number];
    });
  }, SAMPLES);
  return rgbs.map(classify);
}

/** Renders page 1 of a PDF in the browser with pdf.js and samples the same points. */
async function samplePdf(page: Page, pdfBytes: Buffer): Promise<string[]> {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.min.mjs"), type: "module" });
  await page.waitForFunction(() => "pdfjsLib" in globalThis);
  const rgbs: Rgb[] = await page.evaluate(
    async ({ b64, pts }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = (globalThis as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const data = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const doc = await lib.getDocument({ data }).promise;
      const p = await doc.getPage(1);
      const viewport = p.getViewport({ scale: 600 / p.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await p.render({ canvas, viewport }).promise;
      const ctx = canvas.getContext("2d")!;
      return pts.map(([fx, fy]: readonly [number, number]) => {
        const d = ctx.getImageData(Math.floor(fx * canvas.width), Math.floor(fy * canvas.height), 1, 1).data;
        return [d[0], d[1], d[2]];
      });
    },
    { b64: pdfBytes.toString("base64"), pts: SAMPLES },
  );
  return rgbs.map(classify);
}

test("homepage shows the main call to action and the one-document rule", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Print anywhere");
  const cta = page.getByRole("link", { name: "START PRINTING", exact: true }).first();
  await expect(cta).toBeInViewport();
  await expect(page.getByText(/One document per order/)).toBeVisible();
  await expect(page.getByText(/max 5|5 files/i)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await cta.click();
  await expect(page.getByRole("heading", { name: "Upload your document" })).toBeVisible();
});

test("single file: one document, replace, remove, and invalid files", async ({ page }) => {
  await page.goto("/print");
  const input = page.getByTestId("file-input");
  await expect(input).not.toHaveAttribute("multiple");
  const continueBtn = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueBtn).toBeDisabled();

  // Dropping two files at once → only the first is used, with an explanation.
  const png = quadrantPng(40, 30).toString("base64");
  const dataTransfer = await page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "first.png", { type: "image/png" }));
    dt.items.add(new File([bytes], "second.png", { type: "image/png" }));
    return dt;
  }, png);
  await page.getByTestId("dropzone").dispatchEvent("drop", { dataTransfer });
  await expect(page.getByTestId("file-row")).toHaveCount(1);
  await expect(page.getByTestId("file-row")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(page.getByTestId("file-row")).toContainText("first.png");
  await expect(page.getByText(/One document per order: we used “first.png”/)).toBeVisible();
  await expect(page.getByTestId("file-row")).toContainText("Format: PNG");
  await expect(page.getByTestId("file-row")).toContainText("40 × 30 px");
  await expect(continueBtn).toBeEnabled();

  // Replace with an unsupported file → error, Continue disabled.
  await page.getByRole("button", { name: "Replace" }).click();
  await chooseFiles(page, [{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from(TEXT_FILE) }]);
  await expect(page.getByTestId("file-row")).toHaveAttribute("data-status", "error");
  await expect(page.getByTestId("file-row")).toContainText("isn't supported");
  await expect(continueBtn).toBeDisabled();

  // Replace with an oversized file → error.
  await chooseFiles(page, [{ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(21 * 1024 * 1024, 0x25) }]);
  await expect(page.getByTestId("file-row")).toContainText("maximum is 20.0 MB");
  await expect(continueBtn).toBeDisabled();

  // Disguised file (.pdf extension, not a PDF) → rejected by the server.
  await chooseFiles(page, [{ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from(TEXT_FILE) }]);
  await expect(page.getByTestId("file-row")).toHaveAttribute("data-status", "error", { timeout: 20_000 });
  await expect(page.getByTestId("file-row")).toContainText("isn't supported");

  // Replace with a valid JPG → ready.
  await chooseFiles(page, [{ name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(JPG_SAMPLE) }]);
  await expect(page.getByTestId("file-row")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(page.getByTestId("file-row")).toContainText("Format: JPG");

  // Remove → back to the empty upload area.
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("file-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Browse files" })).toBeVisible();
  await expect(continueBtn).toBeDisabled();
  await expectNoHorizontalScroll(page);
});

test("PDF: preview, page selection, settings, price, payment, kiosk gets only those pages", async ({ page, request }) => {
  await page.goto("/print");
  await chooseFiles(page, [{ name: LONG_PDF_NAME, mimeType: "application/pdf", buffer: Buffer.from(await makePdf(5)) }]);
  await expect(page.getByTestId("file-row")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(page.getByTestId("file-row")).toContainText("Pages: 5");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Step 2: preview + page selection
  await expect(page.getByRole("heading", { name: "Preview & choose pages" })).toBeVisible();
  await expect(page.getByTestId("pdf-page")).toHaveCount(5);
  await expect(page.getByTestId("pdf-page").first().locator("canvas")).toBeVisible({ timeout: 20_000 }); // rendered
  await expect(page.getByText("5 of 5 pages selected")).toBeVisible();
  await page.getByText("Choose pages", { exact: true }).click();
  // Tap pages 3 and 5 to deselect them.
  await page.locator('[data-testid="pdf-page"][data-page="3"] button').first().click();
  await page.locator('[data-testid="pdf-page"][data-page="5"] button').first().click();
  await expect(page.getByLabel(/Tap pages below/)).toHaveValue("1-2,4");
  await expect(page.getByText("3 of 5 pages selected")).toBeVisible();
  // Typed input works too, and invalid input blocks Continue.
  await page.getByLabel(/Tap pages below/).fill("9");
  await expect(page.getByText(/doesn't exist/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to settings" })).toBeDisabled();
  await page.getByLabel(/Tap pages below/).fill("1-2, 4");
  await expect(page.locator('[data-testid="pdf-page"][data-page="4"]')).toHaveAttribute("data-selected", "true");
  await expect(page.locator('[data-testid="pdf-page"][data-page="3"]')).toHaveAttribute("data-selected", "false");
  // Larger preview
  await page.getByRole("button", { name: "Show page 2 larger" }).click();
  await expect(page.getByRole("dialog", { name: "Page 2 preview" })).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Continue to settings" }).click();

  // Step 3: settings + summary + live price
  const total = page.getByTestId("order-total");
  await expect(page.getByTestId("order-summary")).toContainText("1-2,4 (3 of 5)");
  await expect(total).toHaveText(rupiah("1.500")); // 3 × 500
  await page.getByText("Color", { exact: true }).click();
  await expect(total).toHaveText(rupiah("4.500")); // 3 × 1500
  await page.getByRole("button", { name: "More copies" }).click();
  await expect(total).toHaveText(rupiah("9.000")); // 6 × 1500
  await expect(page.getByTestId("order-summary")).toContainText("3 × 2 = 6");
  await expectNoHorizontalScroll(page);

  const { orderId, code } = await payAndGetCode(page);
  await expect(page.getByTestId("summary-total")).toHaveText(rupiah("9.000"));
  await expectNoHorizontalScroll(page);

  // Kiosk: settings are right; the print file contains exactly the 3 chosen pages; original keeps 5.
  const order = await kioskClaim(request, code);
  expect(order).toMatchObject({ orderId, totalPrice: 9000, totalPrintedPages: 6 });
  expect(order.files).toHaveLength(1);
  const f = order.files[0];
  expect(f).toMatchObject({
    name: LONG_PDF_NAME,
    format: "PDF",
    pageCount: 5,
    print: { mimeType: "application/pdf", pageCount: 3, pages: "all" },
    settings: { paperSize: "A4", colorMode: "COLOR", copies: 2, pages: "1-2,4", selectedPageCount: 3, printedPages: 6 },
  });
  const printRes = await request.get(f.downloadPath, { headers: kioskHeaders });
  expect(printRes.status()).toBe(200);
  expect(printRes.headers()["x-file-variant"]).toBe("print");
  expect((await PDFDocument.load(await printRes.body())).getPageCount()).toBe(3);
  const origRes = await request.get(f.original.downloadPath, { headers: kioskHeaders });
  expect((await PDFDocument.load(await origRes.body())).getPageCount()).toBe(5);
  expect((await request.post(`/api/kiosk/orders/${orderId}/complete`, { headers: kioskHeaders })).status()).toBe(200);

  // Completed orders can't be printed again.
  const again = await request.post("/api/kiosk/lookup", { headers: kioskHeaders, data: { code } });
  expect(again.status()).toBe(409);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Printed. Thank you!" })).toBeVisible();
});

test("image: rotate, crop, fill — the kiosk's print file matches the preview", async ({ page, request }) => {
  await page.goto("/print");
  await chooseFiles(page, [{ name: "quadrants.png", mimeType: "image/png", buffer: quadrantPng(800, 600) }]);
  await expect(page.getByTestId("file-row")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Adjust & preview" })).toBeVisible();
  const preview = page.getByTestId("a4-preview");
  await expect(preview).toBeVisible();
  await page.waitForTimeout(300);
  // Default "Fit to A4": landscape picture across the page width, white above/below.
  const fitted = await sampleCanvas(page, "a4-preview");
  expect(fitted[0]).toBe("white");
  expect(new Set(fitted)).toEqual(new Set(["white", "red", "green", "blue", "yellow"]));

  // Rotate right → blue/red on top, yellow/green below.
  await page.getByRole("button", { name: "Rotate right 90 degrees" }).click();
  // Crop: drag the bottom-right corner to keep roughly the top-left 60% × 60%.
  await page.getByRole("button", { name: "Crop" }).click();
  const box = (await page.getByTestId("crop-box").boundingBox())!;
  const handle = page.getByRole("button", { name: /Resize crop from bottom right/ });
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width - 4, hb.y + hb.height - 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("button", { name: /Fill page/ }).click();
  // Nudge the position by dragging the preview.
  const pb = (await preview.boundingBox())!;
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await page.mouse.move(pb.x + pb.width / 2 + pb.width * 0.05, pb.y + pb.height / 2 + pb.height * 0.04, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const previewColors = await sampleCanvas(page, "a4-preview");
  expect(new Set(previewColors).size).toBeGreaterThan(1);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Continue to settings" }).click();
  await expect(page.getByTestId("a4-thumb")).toBeVisible();
  await expect(page.getByText("Image adjusted for A4")).toBeVisible();
  await expect(page.getByTestId("order-total")).toHaveText(rupiah("500"));

  const { code } = await payAndGetCode(page);
  await expect(page.getByText(/Image adjusted/)).toBeVisible();

  // The kiosk downloads the server-rendered A4 PDF. It must look like the customer's preview.
  const order = await kioskClaim(request, code);
  const f = order.files[0];
  expect(f).toMatchObject({ format: "PNG", print: { mimeType: "application/pdf", pageCount: 1 } });
  expect(f.settings.imageAdjustment).toMatchObject({ rotation: 90 });
  expect(f.settings.imageAdjustment.crop.w).toBeLessThan(0.8);
  const res = await request.get(f.downloadPath, { headers: kioskHeaders });
  expect(res.headers()["content-type"]).toBe("application/pdf");
  const printColors = await samplePdf(page, await res.body());
  const mismatches = previewColors.filter((c, i) => c !== printColors[i]).length;
  expect(mismatches, `preview ${previewColors.join(",")} vs print ${printColors.join(",")}`).toBeLessThanOrEqual(1);

  // The original upload is preserved unchanged.
  const original = await request.get(f.original.downloadPath, { headers: kioskHeaders });
  expect(original.headers()["content-type"]).toBe("image/png");
  expect((await original.body()).equals(quadrantPng(800, 600))).toBe(true);
  // Finish the job so no order is left in PROCESSING (the kiosk would offer it for recovery).
  expect((await request.post(`/api/kiosk/orders/${order.orderId}/complete`, { headers: kioskHeaders })).status()).toBe(200);
});

test("unpaid orders have no usable code, and other browsers can't open the order", async ({ page, request, browser }) => {
  await page.goto("/print");
  await chooseFiles(page, [{ name: "a.png", mimeType: "image/png", buffer: quadrantPng(40, 30) }]);
  await expect(page.getByTestId("file-row")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue to settings" }).click();
  await page.getByRole("button", { name: "Go to payment" }).click();
  await expect(page).toHaveURL(/\/pay\//, { timeout: 30_000 });
  const orderId = page.url().split("/pay/")[1];

  // Opening/reloading the pay page doesn't pay; unpaid → no code.
  await page.reload();
  await page.goto(`/order/${orderId}`);
  await expect(page).toHaveURL(new RegExp(`/pay/${orderId}`));
  const res = await page.request.get(`/api/orders/${orderId}`);
  expect((await res.json()).order).toMatchObject({ status: "PENDING_PAYMENT", collectionCode: null });

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(`/pay/${orderId}`);
  await expect(otherPage.getByRole("heading", { name: "Order not found" })).toBeVisible();
  expect((await otherPage.request.post(`/api/orders/${orderId}/pay`)).status()).toBe(404);
  await other.close();

  expect((await request.post("/api/kiosk/lookup", { data: { code: "PN123456" } })).status()).toBe(401);
});

test("draft survives a page reload (file kept in the browser)", async ({ page }) => {
  await page.goto("/print");
  await chooseFiles(page, [{ name: "keep.png", mimeType: "image/png", buffer: quadrantPng(400, 300) }]);
  await expect(page.getByTestId("file-row")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Rotate right 90 degrees" }).click();
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByTestId("a4-preview")).toBeVisible();
  await expect(page.getByText("Preview not available")).toHaveCount(0);
  await page.waitForTimeout(400);
  // Rotated portrait picture now spans the printable width; top-left sample is blue.
  const colors = await sampleCanvas(page, "a4-preview");
  expect(colors).toContain("blue");
});

test("help page answers the key questions", async ({ page }) => {
  await page.goto("/help");
  for (const q of ["Which file types can I print?", "Can I adjust a photo before printing?", "How does payment work?"]) {
    await expect(page.getByText(q)).toBeVisible();
  }
  await page.getByText("How does payment work?").click();
  await expect(page.getByText("No real money is taken")).toBeVisible();
  await expectNoHorizontalScroll(page);
});
