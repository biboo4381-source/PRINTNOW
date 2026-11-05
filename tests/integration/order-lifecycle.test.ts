import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/codes";
import { getDb } from "@/lib/db";
import { orders, payments, pricingConfig, uploadedFiles } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { runCleanup } from "@/lib/services/cleanup";
import { verifyUploadedFile } from "@/lib/services/files";
import { claimOrder, completeOrder, failOrder, getFileForKiosk, lookupByCode } from "@/lib/services/kiosk";
import { cancelOrder, createOrder, getOrderForCustomer, payOrder } from "@/lib/services/orders";
import { getActivePrices } from "@/lib/services/pricing";
import { objectSize, writeLocalObject } from "@/lib/storage";
import { JPG_HEADER, PNG_1PX, TEXT_FILE, makeEncryptedPdf, makePdf } from "../fixtures";

async function upload(bytes: Uint8Array, name: string) {
  const key = `uploads/${randomUUID()}/file-test.bin`;
  await writeLocalObject(key, bytes);
  return { key, verify: () => verifyUploadedFile(key, name) };
}

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function paidOrder(pages = 3, copies = 1) {
  const pdf = await (await upload(await makePdf(pages), "doc.pdf")).verify();
  const { orderId, accessToken } = await createOrder([{ fileId: pdf.id, colorMode: "BW", copies, pageSelection: "all" }]);
  const { collectionCode } = await payOrder(orderId, accessToken);
  return { orderId, accessToken, collectionCode, fileId: pdf.id };
}

beforeAll(async () => {
  await getDb(); // run migrations once
});

describe("upload validation (scenarios 1–4)", () => {
  it("1. accepts a valid PDF and counts its pages", async () => {
    const file = await (await upload(await makePdf(12), "Thesis Final.pdf")).verify();
    expect(file).toMatchObject({ format: "PDF", pageCount: 12, name: "Thesis Final.pdf" });
  });

  it("2. accepts PNG and JPG images as one page each", async () => {
    expect(await (await upload(PNG_1PX, "photo.png")).verify()).toMatchObject({ format: "PNG", pageCount: 1 });
    expect(await (await upload(JPG_HEADER, "photo.jpg")).verify()).toMatchObject({ format: "JPG", pageCount: 1 });
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

  it("rejects password-protected PDFs and unknown keys", async () => {
    await expectAppError((await upload(await makeEncryptedPdf(), "locked.pdf")).verify(), "PDF_ENCRYPTED");
    await expectAppError(verifyUploadedFile("../../etc/passwd", "x"), "INVALID_UPLOAD");
    await expectAppError(verifyUploadedFile(`uploads/${randomUUID()}/missing.pdf`, "x"), "UPLOAD_NOT_FOUND");
  });
});

describe("configuration and pricing (scenarios 5–9)", () => {
  it("uses the seeded placeholder prices", async () => {
    expect(await getActivePrices()).toEqual({ bwPricePerPage: 500, colorPricePerPage: 1500, currency: "IDR" });
  });

  it("5–9. stores settings per file and recalculates the total on the server", async () => {
    const pdf = await (await upload(await makePdf(10), "report.pdf")).verify();
    const img = await (await upload(PNG_1PX, "poster.png")).verify();
    const { orderId, accessToken } = await createOrder([
      { fileId: pdf.id, colorMode: "BW", copies: 2, pageSelection: "1-3, 5" }, // 4 pages × 2 × 500 = 4000
      { fileId: img.id, colorMode: "COLOR", copies: 3, pageSelection: "all" }, // 1 × 3 × 1500 = 4500
    ]);
    const view = await getOrderForCustomer(orderId, accessToken);
    expect(view).not.toBeNull();
    expect(view!.status).toBe("PENDING_PAYMENT");
    expect(view!.totalPrice).toBe(8500);
    expect(view!.totalPrintedPages).toBe(11);
    expect(view!.collectionCode).toBeNull();
    expect(view!.items).toMatchObject([
      { name: "report.pdf", colorMode: "BW", copies: 2, pageSelection: "1-3,5", selectedPageCount: 4, subtotal: 4000, paperSize: "A4" },
      { name: "poster.png", colorMode: "COLOR", copies: 3, pageSelection: "all", selectedPageCount: 1, subtotal: 4500 },
    ]);
  });

  it("uses a new price row for new orders without changing old ones", async () => {
    const before = await paidOrder(2); // 2 × 500 = 1000
    const db = await getDb();
    await db.insert(pricingConfig).values({ bwPricePerPage: 700, colorPricePerPage: 2000, note: "test" });
    const pdf = await (await upload(await makePdf(2), "a.pdf")).verify();
    const { orderId, accessToken } = await createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all" }]);
    expect((await getOrderForCustomer(orderId, accessToken))!.totalPrice).toBe(1400);
    expect((await getOrderForCustomer(before.orderId, before.accessToken))!.totalPrice).toBe(1000);
    await db.delete(pricingConfig).where(eq(pricingConfig.note, "test"));
  });

  it("rejects invalid settings", async () => {
    const pdf = await (await upload(await makePdf(3), "x.pdf")).verify();
    await expectAppError(createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "4-5" }]), "INVALID_PAGES");
    await expectAppError(createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 0, pageSelection: "all" }]), "INVALID_COPIES");
    await expectAppError(createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 51, pageSelection: "all" }]), "INVALID_COPIES");
    await expectAppError(createOrder([{ fileId: pdf.id, colorMode: "SEPIA", copies: 1, pageSelection: "all" }]), "INVALID_MODE");
    await expectAppError(createOrder([]), "NO_FILES");
  });

  it("does not let a file be used in two orders", async () => {
    const pdf = await (await upload(await makePdf(1), "once.pdf")).verify();
    await createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all" }]);
    await expectAppError(createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all" }]), "FILE_UNAVAILABLE");
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
    const again = await payOrder(orderId, accessToken);
    expect(again).toEqual({ collectionCode, alreadyPaid: true });
    const db = await getDb();
    expect(await db.select().from(payments).where(eq(payments.orderId, orderId))).toHaveLength(1);
  });

  it("concurrent payment clicks produce exactly one payment", async () => {
    const pdf = await (await upload(await makePdf(1), "race.pdf")).verify();
    const { orderId, accessToken } = await createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all" }]);
    const results = await Promise.all([payOrder(orderId, accessToken), payOrder(orderId, accessToken), payOrder(orderId, accessToken)]);
    expect(new Set(results.map((r) => r.collectionCode)).size).toBe(1);
    const db = await getDb();
    expect(await db.select().from(payments).where(eq(payments.orderId, orderId))).toHaveLength(1);
  });

  it("12. unpaid orders have no code and cannot be found at the kiosk", async () => {
    const pdf = await (await upload(await makePdf(1), "unpaid.pdf")).verify();
    const { orderId, accessToken } = await createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all" }]);
    const view = await getOrderForCustomer(orderId, accessToken);
    expect(view!.collectionCode).toBeNull();
    const db = await getDb();
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row.collectionCode).toBeNull();
  });

  it("only the browser holding the order token can view or pay", async () => {
    const pdf = await (await upload(await makePdf(1), "private.pdf")).verify();
    const { orderId } = await createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all" }]);
    expect(await getOrderForCustomer(orderId, "wrong-token")).toBeNull();
    expect(await getOrderForCustomer(orderId, undefined)).toBeNull();
    await expectAppError(payOrder(orderId, "wrong-token"), "ORDER_NOT_FOUND");
    await expectAppError(payOrder("not-a-uuid", "x"), "ORDER_NOT_FOUND");
  });

  it("expired unpaid orders cannot be paid", async () => {
    const pdf = await (await upload(await makePdf(1), "late.pdf")).verify();
    const { orderId, accessToken } = await createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all" }]);
    const db = await getDb();
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, orderId));
    await expectAppError(payOrder(orderId, accessToken), "ORDER_EXPIRED");
    expect((await getOrderForCustomer(orderId, accessToken))!.status).toBe("EXPIRED");
  });

  it("cancelled orders cannot be paid", async () => {
    const pdf = await (await upload(await makePdf(1), "cancel.pdf")).verify();
    const { orderId, accessToken } = await createOrder([{ fileId: pdf.id, colorMode: "BW", copies: 1, pageSelection: "all" }]);
    await cancelOrder(orderId, accessToken);
    await expectAppError(payOrder(orderId, accessToken), "ORDER_NOT_PAYABLE");
  });
});

describe("kiosk flow (scenarios 12–15)", () => {
  const KIOSK = "kiosk-test";

  it("12. a kiosk lookup of an unpaid or unknown code fails", async () => {
    await expectAppError(lookupByCode(KIOSK, "PN000000"), "INVALID_CODE");
    await expectAppError(lookupByCode(KIOSK, "garbage"), "INVALID_CODE");
  });

  it("13–14. the code retrieves the right order, files and settings", async () => {
    const pdf = await (await upload(await makePdf(6), "slides.pdf")).verify();
    const img = await (await upload(PNG_1PX, "cover.png")).verify();
    const { orderId, accessToken } = await createOrder([
      { fileId: pdf.id, colorMode: "COLOR", copies: 2, pageSelection: "2-4" },
      { fileId: img.id, colorMode: "BW", copies: 1, pageSelection: "all" },
    ]);
    const { collectionCode } = await payOrder(orderId, accessToken);

    const found = await lookupByCode(KIOSK, collectionCode.toLowerCase().replace("pn", "pn ")); // forgiving input
    expect(found).toMatchObject({ orderId, status: "PAID", totalPrice: 9500, totalPrintedPages: 7 });
    expect(found.files).toMatchObject([
      { fileId: pdf.id, name: "slides.pdf", format: "PDF", pageCount: 6, settings: { paperSize: "A4", colorMode: "COLOR", copies: 2, pages: "2-4", selectedPageCount: 3, printedPages: 6 } },
      { fileId: img.id, name: "cover.png", format: "PNG", settings: { colorMode: "BW", copies: 1, pages: "all" } },
    ]);

    // Files can't be downloaded before claiming.
    await expectAppError(getFileForKiosk(KIOSK, orderId, pdf.id), "NOT_CLAIMED");

    const claimed = await claimOrder(KIOSK, orderId, collectionCode);
    expect(claimed.status).toBe("PROCESSING");
    const { bytes, file } = await getFileForKiosk(KIOSK, orderId, pdf.id);
    expect(sha256Hex(bytes)).toBe(file.sha256);
    // Another kiosk can't download it.
    await expectAppError(getFileForKiosk("kiosk-other", orderId, pdf.id), "NOT_CLAIMED");

    await completeOrder(KIOSK, orderId);
    expect((await getOrderForCustomer(orderId, accessToken))!.status).toBe("COMPLETED");
  });

  it("15. completed orders cannot be printed again", async () => {
    const { orderId, collectionCode } = await paidOrder();
    await claimOrder(KIOSK, orderId, collectionCode);
    await completeOrder(KIOSK, orderId);
    await expectAppError(lookupByCode(KIOSK, collectionCode), "ALREADY_COMPLETED");
    await expectAppError(claimOrder(KIOSK, orderId, collectionCode), "ALREADY_COMPLETED");
    // Completing twice is harmless.
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
    // Other kiosks are unaffected.
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
  it("expires overdue orders and deletes their files and stale uploads", async () => {
    const db = await getDb();
    const { orderId } = await paidOrder();
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, orderId));
    const orphan = await upload(await makePdf(1), "orphan.pdf");
    const orphanFile = await orphan.verify();
    await db
      .update(uploadedFiles)
      .set({ uploadedAt: new Date(Date.now() - 48 * 3600_000) })
      .where(eq(uploadedFiles.id, orphanFile.id));

    const result = await runCleanup();
    expect(result.errors).toEqual([]);
    expect(result.expiredOrders).toBeGreaterThanOrEqual(1);
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("EXPIRED");
    const [f] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, orphanFile.id));
    expect(f.deletedAt).not.toBeNull();
    expect(await objectSize(orphan.key)).toBeNull();
  });
});
