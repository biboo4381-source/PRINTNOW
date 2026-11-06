import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/codes";
import { getDb } from "@/lib/db";
import { orders, payments, pricingConfig, printSettings, uploadedFiles } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { A4 } from "@/lib/image-layout";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { runCleanup } from "@/lib/services/cleanup";
import { verifyUploadedFile } from "@/lib/services/files";
import { claimOrder, completeOrder, failOrder, getFileForKiosk, lookupByCode } from "@/lib/services/kiosk";
import { cancelOrder, createOrder, getOrderForCustomer, payOrder } from "@/lib/services/orders";
import { getActivePrices } from "@/lib/services/pricing";
import { objectSize, readObject, writeLocalObject } from "@/lib/storage";
import { JPG_SAMPLE, PNG_1PX, TEXT_FILE, makeEncryptedPdf, makePdf } from "../fixtures";
import { quadrantPng } from "../png";

const PT = 72 / 25.4;

async function upload(bytes: Uint8Array, name: string) {
  const key = `uploads/${randomUUID()}/file-test.bin`;
  await writeLocalObject(key, bytes);
  return { key, verify: () => verifyUploadedFile(key, name) };
}

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function pdfOrder(pages = 3, overrides: Record<string, unknown> = {}) {
  const pdf = await (await upload(await makePdf(pages), "doc.pdf")).verify();
  const created = await createOrder({ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all", ...overrides });
  return { ...created, fileId: pdf.id };
}

async function paidOrder(pages = 3, copies = 1) {
  const o = await pdfOrder(pages, { copies });
  const { collectionCode } = await payOrder(o.orderId, o.accessToken);
  return { ...o, collectionCode };
}

async function printRow(orderId: string) {
  const db = await getDb();
  const [row] = await db.select().from(printSettings).where(eq(printSettings.orderId, orderId));
  return row;
}

beforeAll(async () => {
  await getDb(); // run migrations once
});

describe("upload validation (scenarios 1–4)", () => {
  it("1. accepts a valid PDF and counts its pages (no page-count restriction from the single-file rule)", async () => {
    const file = await (await upload(await makePdf(40), "Thesis Final.pdf")).verify();
    expect(file).toMatchObject({ format: "PDF", pageCount: 40, name: "Thesis Final.pdf", imageWidth: null });
  });

  it("2. accepts PNG and JPG, recording their pixel size", async () => {
    expect(await (await upload(PNG_1PX, "dot.png")).verify()).toMatchObject({ format: "PNG", pageCount: 1, imageWidth: 1, imageHeight: 1 });
    expect(await (await upload(JPG_SAMPLE, "photo.jpg")).verify()).toMatchObject({ format: "JPG", pageCount: 1, imageWidth: 160, imageHeight: 120 });
  });

  it("3. rejects an unsupported file and deletes it from storage", async () => {
    const u = await upload(TEXT_FILE, "notes.pdf"); // wrong extension does not fool the server
    await expectAppError(u.verify(), "UNSUPPORTED_TYPE");
    expect(await objectSize(u.key)).toBeNull();
  });

  it("4. rejects an oversized file", async () => {
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expectAppError((await upload(big, "huge.pdf")).verify(), "FILE_TOO_LARGE");
  });

  it("rejects password-protected PDFs, broken images and unknown keys", async () => {
    await expectAppError((await upload(await makeEncryptedPdf(), "locked.pdf")).verify(), "PDF_ENCRYPTED");
    await expectAppError((await upload(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]), "broken.jpg")).verify(), "IMAGE_UNREADABLE");
    await expectAppError(verifyUploadedFile("../../etc/passwd", "x"), "INVALID_UPLOAD");
    await expectAppError(verifyUploadedFile(`uploads/${randomUUID()}/missing.pdf`, "x"), "UPLOAD_NOT_FOUND");
  });
});

describe("one document per order", () => {
  it("rejects multiple files in one order", async () => {
    const a = await (await upload(await makePdf(1), "a.pdf")).verify();
    const b = await (await upload(await makePdf(1), "b.pdf")).verify();
    const items = [a, b].map((f) => ({ fileId: f.id, colorMode: "BW", copies: 1, pageSelection: "all" }));
    await expectAppError(createOrder(items), "ONE_FILE_ONLY");
  });

  it("does not let a file be used in two orders", async () => {
    const o = await pdfOrder(1);
    await expectAppError(createOrder({ fileId: o.fileId, colorMode: "BW", copies: 1, pageSelection: "all" }), "FILE_UNAVAILABLE");
  });

  it("requires a file", async () => {
    await expectAppError(createOrder({ colorMode: "BW", copies: 1 }), "NO_FILE");
  });
});

describe("configuration and pricing (scenarios 5–9)", () => {
  it("uses the team prices (B&W Rp 1.000, color Rp 2.500 per page)", async () => {
    expect(await getActivePrices()).toEqual({ bwPricePerPage: 1000, colorPricePerPage: 2500, currency: "IDR" });
  });

  it("5/7/8/9. B&W, copies and page selection are stored and priced on the server", async () => {
    const o = await pdfOrder(10, { copies: 2, pageSelection: "1-3, 5" }); // 4 pages × 2 × 1000
    const view = await getOrderForCustomer(o.orderId, o.accessToken);
    expect(view).toMatchObject({ status: "PENDING_PAYMENT", totalPrice: 8000, totalPrintedPages: 8, collectionCode: null });
    expect(view!.items).toHaveLength(1);
    expect(view!.items[0]).toMatchObject({ colorMode: "BW", copies: 2, pageSelection: "1-3,5", selectedPageCount: 4, paperSize: "A4", imageAdjustment: null });
  });

  it("6. color pricing for an image (always one page)", async () => {
    const img = await (await upload(PNG_1PX, "poster.png")).verify();
    const o = await createOrder({ fileId: img.id, colorMode: "COLOR", copies: 3, pageSelection: "1-9" }); // pages ignored for images
    const view = await getOrderForCustomer(o.orderId, o.accessToken);
    expect(view).toMatchObject({ totalPrice: 7500, totalPrintedPages: 3 });
    expect(view!.items[0]).toMatchObject({ pageSelection: "all", selectedPageCount: 1, imageAdjusted: false });
  });

  it("uses a new price row for new orders without changing old ones", async () => {
    const before = await paidOrder(2); // 2 × 1000 = 2000
    const db = await getDb();
    await db.insert(pricingConfig).values({ bwPricePerPage: 700, colorPricePerPage: 2000, note: "test" });
    const after = await pdfOrder(2);
    expect((await getOrderForCustomer(after.orderId, after.accessToken))!.totalPrice).toBe(1400);
    expect((await getOrderForCustomer(before.orderId, before.accessToken))!.totalPrice).toBe(2000);
    await db.delete(pricingConfig).where(eq(pricingConfig.note, "test"));
  });

  it("rejects invalid settings", async () => {
    const pdf = await (await upload(await makePdf(3), "x.pdf")).verify();
    const base = { fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all" };
    await expectAppError(createOrder({ ...base, pageSelection: "4-5" }), "INVALID_PAGES");
    await expectAppError(createOrder({ ...base, copies: 0 }), "INVALID_COPIES");
    await expectAppError(createOrder({ ...base, copies: 51 }), "INVALID_COPIES");
    await expectAppError(createOrder({ ...base, colorMode: "SEPIA" }), "INVALID_MODE");
  });
});

describe("print-ready output for the kiosk", () => {
  it("whole PDF: the original file is the print file", async () => {
    const o = await pdfOrder(4);
    const row = await printRow(o.orderId);
    const db = await getDb();
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, o.fileId));
    expect(row).toMatchObject({ printStorageKey: file.storageKey, printPages: "all", printPageCount: 4, printSha256: file.sha256 });
  });

  it("PDF page selection: a new PDF with only the chosen pages; original preserved", async () => {
    const o = await pdfOrder(10, { pageSelection: "2, 4-6" });
    const row = await printRow(o.orderId);
    expect(row.printStorageKey).toMatch(/^prints\//);
    expect(row).toMatchObject({ printPages: "all", printPageCount: 4, pageSelection: "2,4-6" });
    const printed = await PDFDocument.load((await readObject(row.printStorageKey!))!);
    expect(printed.getPageCount()).toBe(4);
    const db = await getDb();
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, o.fileId));
    const original = await PDFDocument.load((await readObject(file.storageKey))!);
    expect(original.getPageCount()).toBe(10);
  });

  it("image: renders a single A4 PDF page from the saved adjustment", async () => {
    const img = await (await upload(quadrantPng(400, 300), "photo.png")).verify();
    const adjustment = { rotation: 90, crop: { x: 0.1, y: 0, w: 0.8, h: 1 }, zoom: 1.2, offsetX: 5, offsetY: -10 };
    const o = await createOrder({ fileId: img.id, colorMode: "COLOR", copies: 1, pageSelection: "all", imageAdjustment: adjustment });
    const row = await printRow(o.orderId);
    expect(row.imageAdjustment).toEqual(adjustment);
    expect(row).toMatchObject({ printMimeType: "application/pdf", printPageCount: 1, printPages: "all" });
    const bytes = (await readObject(row.printStorageKey!))!;
    expect(sha256Hex(bytes)).toBe(row.printSha256);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(A4.width * PT, 1);
    expect(height).toBeCloseTo(A4.height * PT, 1);
    const view = await getOrderForCustomer(o.orderId, o.accessToken);
    expect(view!.items[0].imageAdjusted).toBe(true);
  });

  it("image: JPEG renders too, and an invalid adjustment is refused", async () => {
    const img = await (await upload(JPG_SAMPLE, "photo.jpg")).verify();
    await expectAppError(
      createOrder({ fileId: img.id, colorMode: "BW", copies: 1, imageAdjustment: { rotation: 45, crop: { x: 0, y: 0, w: 1, h: 1 }, zoom: 1, offsetX: 0, offsetY: 0 } }),
      "INVALID_ADJUSTMENT",
    );
    const o = await createOrder({ fileId: img.id, colorMode: "BW", copies: 1 });
    const row = await printRow(o.orderId);
    expect((await PDFDocument.load((await readObject(row.printStorageKey!))!)).getPageCount()).toBe(1);
  });
});

describe("payment and collection codes (scenarios 10–12)", () => {
  it("10–11. simulated payment marks the order paid and issues a code", async () => {
    const { orderId, accessToken, collectionCode } = await paidOrder();
    expect(collectionCode).toMatch(/^PN\d{6}$/);
    const view = await getOrderForCustomer(orderId, accessToken);
    expect(view).toMatchObject({ status: "PAID", paymentStatus: "PAID", collectionCode });
    const db = await getDb();
    const rows = await db.select().from(payments).where(eq(payments.orderId, orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ paymentType: "DUMMY_QRIS", simulationStatus: "SIMULATED_SUCCESS", amount: view!.totalPrice });
  });

  it("paying twice is idempotent: same code, one payment row", async () => {
    const { orderId, accessToken, collectionCode } = await paidOrder();
    expect(await payOrder(orderId, accessToken)).toEqual({ collectionCode, alreadyPaid: true });
    const db = await getDb();
    expect(await db.select().from(payments).where(eq(payments.orderId, orderId))).toHaveLength(1);
  });

  it("concurrent payment clicks produce exactly one payment", async () => {
    const { orderId, accessToken } = await pdfOrder(1);
    const results = await Promise.all([payOrder(orderId, accessToken), payOrder(orderId, accessToken), payOrder(orderId, accessToken)]);
    expect(new Set(results.map((r) => r.collectionCode)).size).toBe(1);
    const db = await getDb();
    expect(await db.select().from(payments).where(eq(payments.orderId, orderId))).toHaveLength(1);
  });

  it("12. unpaid orders have no code", async () => {
    const { orderId, accessToken } = await pdfOrder(1);
    expect((await getOrderForCustomer(orderId, accessToken))!.collectionCode).toBeNull();
    const db = await getDb();
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row.collectionCode).toBeNull();
  });

  it("only the browser holding the order token can view or pay", async () => {
    const { orderId } = await pdfOrder(1);
    expect(await getOrderForCustomer(orderId, "wrong-token")).toBeNull();
    expect(await getOrderForCustomer(orderId, undefined)).toBeNull();
    await expectAppError(payOrder(orderId, "wrong-token"), "ORDER_NOT_FOUND");
    await expectAppError(payOrder("not-a-uuid", "x"), "ORDER_NOT_FOUND");
  });

  it("expired unpaid orders cannot be paid", async () => {
    const { orderId, accessToken } = await pdfOrder(1);
    const db = await getDb();
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, orderId));
    await expectAppError(payOrder(orderId, accessToken), "ORDER_EXPIRED");
    expect((await getOrderForCustomer(orderId, accessToken))!.status).toBe("EXPIRED");
  });

  it("cancelled orders cannot be paid", async () => {
    const { orderId, accessToken } = await pdfOrder(1);
    await cancelOrder(orderId, accessToken);
    await expectAppError(payOrder(orderId, accessToken), "ORDER_NOT_PAYABLE");
  });
});

describe("kiosk flow (scenarios 12–15)", () => {
  const KIOSK = "kiosk-test";

  it("12. a kiosk lookup of an unknown code fails", async () => {
    await expectAppError(lookupByCode(KIOSK, "PN000000"), "INVALID_CODE");
    await expectAppError(lookupByCode(KIOSK, "garbage"), "INVALID_CODE");
  });

  it("13–14. code → right order, print file + original, settings and adjustment", async () => {
    const img = await (await upload(quadrantPng(400, 300), "photo.png")).verify();
    const adjustment = { rotation: 180, crop: { x: 0, y: 0, w: 1, h: 1 }, zoom: 1, offsetX: 0, offsetY: 0 };
    const { orderId, accessToken } = await createOrder({ fileId: img.id, colorMode: "COLOR", copies: 2, imageAdjustment: adjustment });
    const { collectionCode } = await payOrder(orderId, accessToken);

    const found = await lookupByCode(KIOSK, collectionCode.toLowerCase().replace("pn", "pn ")); // forgiving input
    expect(found).toMatchObject({ orderId, status: "PAID", totalPrice: 5000, totalPrintedPages: 2 });
    expect(found.files).toHaveLength(1);
    const f = found.files[0];
    expect(f).toMatchObject({
      fileId: img.id,
      name: "photo.png",
      format: "PNG",
      downloadPath: `/api/kiosk/orders/${orderId}/files/${img.id}?variant=print`,
      print: { mimeType: "application/pdf", pageCount: 1, pages: "all" },
      original: { mimeType: "image/png" },
      settings: { paperSize: "A4", colorMode: "COLOR", copies: 2, pages: "all", imageAdjustment: adjustment },
    });

    await expectAppError(getFileForKiosk(KIOSK, orderId, img.id), "NOT_CLAIMED");
    await claimOrder(KIOSK, orderId, collectionCode);

    const printFile = await getFileForKiosk(KIOSK, orderId, img.id); // default = print
    expect(printFile).toMatchObject({ variant: "print", mimeType: "application/pdf", sha256: f.print!.sha256 });
    expect(sha256Hex((await readObject(printFile.storageKey))!)).toBe(f.print!.sha256);
    const original = await getFileForKiosk(KIOSK, orderId, img.id, "original");
    expect(original).toMatchObject({ variant: "original", mimeType: "image/png" });
    expect(sha256Hex((await readObject(original.storageKey))!)).toBe(f.original.sha256);

    await expectAppError(getFileForKiosk("kiosk-other", orderId, img.id), "NOT_CLAIMED");
    await completeOrder(KIOSK, orderId);
    expect((await getOrderForCustomer(orderId, accessToken))!.status).toBe("COMPLETED");
  });

  it("15. completed orders cannot be printed again", async () => {
    const { orderId, collectionCode } = await paidOrder();
    await claimOrder(KIOSK, orderId, collectionCode);
    await completeOrder(KIOSK, orderId);
    await expectAppError(lookupByCode(KIOSK, collectionCode), "ALREADY_COMPLETED");
    await expectAppError(claimOrder(KIOSK, orderId, collectionCode), "ALREADY_COMPLETED");
    await expect(completeOrder(KIOSK, orderId)).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("two kiosks claiming at once: exactly one wins", async () => {
    const { orderId, collectionCode } = await paidOrder();
    const results = await Promise.allSettled([
      claimOrder("kiosk-a", orderId, collectionCode),
      claimOrder("kiosk-b", orderId, collectionCode),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("an order already processing is reported as such", async () => {
    const { orderId, collectionCode } = await paidOrder();
    await claimOrder(KIOSK, orderId, collectionCode);
    await expectAppError(lookupByCode(KIOSK, collectionCode), "ALREADY_PROCESSING");
  });

  it("claim requires the matching code", async () => {
    const { orderId } = await paidOrder();
    await expectAppError(claimOrder(KIOSK, orderId, "PN999999"), "INVALID_CODE");
  });

  it("a retryable failure returns the order to PAID; a fatal one marks it FAILED", async () => {
    const a = await paidOrder();
    await claimOrder(KIOSK, a.orderId, a.collectionCode);
    await expect(failOrder(KIOSK, a.orderId, "Paper jam", true)).resolves.toMatchObject({ status: "PAID" });
    await expect(lookupByCode(KIOSK, a.collectionCode)).resolves.toMatchObject({ status: "PAID" });

    const b = await paidOrder();
    await claimOrder(KIOSK, b.orderId, b.collectionCode);
    await expect(failOrder(KIOSK, b.orderId, "Printer broken", false)).resolves.toMatchObject({ status: "FAILED" });
    await expectAppError(lookupByCode(KIOSK, b.collectionCode), "ORDER_FAILED");
  });

  it("expired paid orders can't be collected", async () => {
    const { orderId, collectionCode } = await paidOrder();
    const db = await getDb();
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, orderId));
    await expectAppError(lookupByCode(KIOSK, collectionCode), "EXPIRED");
  });

  it("rate-limits a kiosk after repeated wrong codes", async () => {
    const kiosk = "kiosk-bruteforce";
    for (let i = 0; i < 5; i++) await expectAppError(lookupByCode(kiosk, `PN11111${i}`), "INVALID_CODE");
    await expectAppError(lookupByCode(kiosk, "PN111119"), "RATE_LIMITED");
    await expectAppError(lookupByCode("kiosk-fine", "PN111119"), "INVALID_CODE");
  });
});

describe("kiosk authentication", () => {
  const key = "pnk_test_key";
  const req = (headers: Record<string, string>) => new Request("http://x/api/kiosk/lookup", { method: "POST", headers });

  it("accepts the right key and rejects everything else", () => {
    process.env.KIOSK_API_KEYS = `kiosk-01:${sha256Hex(key)},kiosk-02:${sha256Hex("other")}`;
    expect(authenticateKiosk(req({ authorization: `Bearer ${key}`, "x-kiosk-id": "kiosk-01" }))).toBe("kiosk-01");
    expect(() => authenticateKiosk(req({ authorization: `Bearer ${key}`, "x-kiosk-id": "kiosk-02" }))).toThrow(AppError);
    expect(() => authenticateKiosk(req({ authorization: "Bearer nope", "x-kiosk-id": "kiosk-01" }))).toThrow(AppError);
    expect(() => authenticateKiosk(req({ "x-kiosk-id": "kiosk-01" }))).toThrow(AppError);
    delete process.env.KIOSK_API_KEYS;
    expect(() => authenticateKiosk(req({ authorization: `Bearer ${key}`, "x-kiosk-id": "kiosk-01" }))).toThrow(AppError);
  });
});

describe("cleanup", () => {
  it("expires overdue orders and deletes their originals, print files and stale uploads", async () => {
    const db = await getDb();
    const img = await (await upload(quadrantPng(40, 30), "old.png")).verify();
    const o = await createOrder({ fileId: img.id, colorMode: "BW", copies: 1 });
    const printKey = (await printRow(o.orderId)).printStorageKey!;
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, o.orderId));

    const orphan = await upload(await makePdf(1), "orphan.pdf");
    const orphanFile = await orphan.verify();
    await db
      .update(uploadedFiles)
      .set({ uploadedAt: new Date(Date.now() - 48 * 3600_000) })
      .where(eq(uploadedFiles.id, orphanFile.id));

    const result = await runCleanup();
    expect(result.errors).toEqual([]);
    const [order] = await db.select().from(orders).where(eq(orders.id, o.orderId));
    expect(order.status).toBe("EXPIRED");
    expect(await objectSize(printKey)).toBeNull();
    expect((await printRow(o.orderId)).printStorageKey).toBeNull();
    const [f] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, orphanFile.id));
    expect(f.deletedAt).not.toBeNull();
    expect(await objectSize(orphan.key)).toBeNull();
  });
});
