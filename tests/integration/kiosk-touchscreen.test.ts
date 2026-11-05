import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/codes";
import { getDb } from "@/lib/db";
import { kioskLogs, orders, printSettings } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { createKioskSession, readKioskSession, verifyKioskKey } from "@/lib/kiosk-auth";
import { verifyUploadedFile } from "@/lib/services/files";
import { claimOrder, completeOrder, failOrder, getActiveJobForKiosk, lookupByCode, prepareJob } from "@/lib/services/kiosk";
import { createOrder, payOrder } from "@/lib/services/orders";
import { writeLocalObject } from "@/lib/storage";
import { makePdf } from "../fixtures";
import { quadrantPng } from "../png";

const KIOSK = "kiosk-touch";
const KEY = "pnk_touch_test_key";

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function paid(bytes: Uint8Array, name: string, extra: Record<string, unknown> = {}) {
  const key = `uploads/${randomUUID()}/file-test.bin`;
  await writeLocalObject(key, bytes);
  const file = await verifyUploadedFile(key, name);
  const { orderId, accessToken } = await createOrder({ fileId: file.id, colorMode: "BW", copies: 1, pageSelection: "all", ...extra });
  const { collectionCode } = await payOrder(orderId, accessToken);
  return { orderId, code: collectionCode };
}

beforeAll(async () => {
  process.env.KIOSK_API_KEYS = `${KIOSK}:${sha256Hex(KEY)}`;
  await getDb();
});

describe("kiosk pairing session", () => {
  it("verifies the kiosk key", () => {
    expect(verifyKioskKey(KIOSK, KEY)).toBe(true);
    expect(verifyKioskKey(KIOSK, "wrong")).toBe(false);
    expect(verifyKioskKey("other", KEY)).toBe(false);
  });

  it("round-trips a session and rejects tampering, expiry and revoked keys", () => {
    const token = createKioskSession(KIOSK);
    expect(readKioskSession(token)).toBe(KIOSK);
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ k: "kiosk-evil", f: "x", exp: Date.now() + 1e9 })).toString("base64url");
    expect(readKioskSession(`${forged}.${mac}`)).toBeNull();
    expect(readKioskSession(`${payload}.${"0".repeat(64)}`)).toBeNull();
    expect(readKioskSession("garbage")).toBeNull();
    expect(readKioskSession(token, Date.now() + 200 * 86_400_000)).toBeNull(); // expired

    process.env.KIOSK_API_KEYS = `${KIOSK}:${sha256Hex("rotated-key")}`;
    expect(readKioskSession(token)).toBeNull(); // key rotated → signed out
    process.env.KIOSK_API_KEYS = `${KIOSK}:${sha256Hex(KEY)}`;
    expect(readKioskSession(token)).toBe(KIOSK);
  });
});

describe("print job preparation", () => {
  it("PDF with selected pages: job uses the extracted print file and real settings", async () => {
    const { orderId, code } = await paid(await makePdf(8), "notes.pdf", { pageSelection: "2-4, 7", copies: 2, colorMode: "COLOR" });
    await expectAppError(prepareJob(KIOSK, orderId), "NOT_CLAIMED"); // must claim first
    await claimOrder(KIOSK, orderId, code);
    const job = await prepareJob(KIOSK, orderId);
    expect(job).toMatchObject({
      fileName: "notes.pdf",
      originalFormat: "PDF",
      colorMode: "COLOR",
      copies: 2,
      paperSize: "A4",
      printFilePageCount: 4,
      pages: [1, 2, 3, 4],
      totalSheets: 8,
    });
    await expectAppError(prepareJob("kiosk-other", orderId), "NOT_CLAIMED");
  });

  it("image: one A4 sheet per copy", async () => {
    const { orderId, code } = await paid(quadrantPng(300, 200), "photo.png", { copies: 3 });
    await claimOrder(KIOSK, orderId, code);
    expect(await prepareJob(KIOSK, orderId)).toMatchObject({ originalFormat: "PNG", printFilePageCount: 1, pages: [1], totalSheets: 3 });
  });

  it("a damaged print file is detected and the order is marked FAILED", async () => {
    const { orderId, code } = await paid(quadrantPng(300, 200), "photo.png");
    const db = await getDb();
    await db.update(printSettings).set({ printSha256: "0".repeat(64) }).where(eq(printSettings.orderId, orderId));
    await claimOrder(KIOSK, orderId, code);
    await expectAppError(prepareJob(KIOSK, orderId), "PRINT_FILE_INVALID");
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order.status).toBe("FAILED");
    expect(order.failureReason).toContain("checksum");
  });
});

describe("simulated completion, failure and recovery", () => {
  it("completion is logged as simulated and can't be repeated", async () => {
    const { orderId, code } = await paid(await makePdf(2), "a.pdf");
    await claimOrder(KIOSK, orderId, code);
    await prepareJob(KIOSK, orderId);
    await completeOrder(KIOSK, orderId, { simulated: true });
    const db = await getDb();
    const logs = await db.select().from(kioskLogs).where(and(eq(kioskLogs.orderId, orderId), eq(kioskLogs.action, "COMPLETE")));
    expect(logs.map((l) => l.result)).toContain("OK_SIMULATED");
    await expectAppError(lookupByCode(KIOSK, code), "ALREADY_COMPLETED");
  });

  it("a simulated retryable failure returns the order to PAID", async () => {
    const { orderId, code } = await paid(await makePdf(1), "b.pdf");
    await claimOrder(KIOSK, orderId, code);
    expect(await failOrder(KIOSK, orderId, "Simulated paper jam", true, { simulated: true })).toMatchObject({ status: "PAID" });
    await expect(lookupByCode(KIOSK, code)).resolves.toMatchObject({ status: "PAID" });
  });

  it("finds this kiosk's unfinished job for recovery", async () => {
    expect(await getActiveJobForKiosk("kiosk-idle")).toBeNull();
    const { orderId, code } = await paid(await makePdf(1), "c.pdf");
    await claimOrder("kiosk-recover", orderId, code);
    expect(await getActiveJobForKiosk("kiosk-recover")).toMatchObject({ orderId, status: "PROCESSING" });
    expect(await getActiveJobForKiosk("kiosk-idle")).toBeNull();
  });
});
