import { and, count, desc, eq, gte } from "drizzle-orm";
import { KIOSK } from "../config";
import { normalizeCollectionCode } from "../codes";
import { type Db, getDb } from "../db";
import { type Order, kioskLogs, orders, uploadedFiles } from "../db/schema";
import { AppError } from "../errors";
import { readObject } from "../storage";
import { expireIfNeeded, isUuid, loadOrderItems } from "./orders";

type KioskAction = (typeof kioskLogs.$inferInsert)["action"];

async function log(
  db: Db,
  entry: { kioskId: string; action: KioskAction; result: string; orderId?: string | null; code?: string | null; error?: string | null },
) {
  await db.insert(kioskLogs).values({
    kioskId: entry.kioskId,
    action: entry.action,
    result: entry.result,
    orderId: entry.orderId ?? null,
    codeAttempted: entry.code ?? null,
    errorDetail: entry.error ?? null,
  });
}

/** Too many wrong codes from one kiosk in the window → temporary lockout. */
async function assertNotRateLimited(db: Db, kioskId: string) {
  const since = new Date(Date.now() - KIOSK.failedLookupWindowMinutes * 60_000);
  const [{ value }] = await db
    .select({ value: count() })
    .from(kioskLogs)
    .where(and(eq(kioskLogs.kioskId, kioskId), eq(kioskLogs.result, "INVALID_CODE"), gte(kioskLogs.createdAt, since)));
  if (value >= KIOSK.maxFailedLookups) {
    throw new AppError("RATE_LIMITED", "Too many incorrect codes. Please wait a few minutes and try again.", 429, {
      retryAfterSeconds: KIOSK.failedLookupWindowMinutes * 60,
    });
  }
}

const STATUS_ERRORS: Partial<Record<Order["status"], [string, string, number]>> = {
  PENDING_PAYMENT: ["NOT_PAID", "This order hasn't been paid yet.", 409],
  PROCESSING: ["ALREADY_PROCESSING", "This order is already being printed.", 409],
  COMPLETED: ["ALREADY_COMPLETED", "This order has already been printed.", 409],
  FAILED: ["ORDER_FAILED", "This order could not be printed. Please contact support.", 409],
  EXPIRED: ["EXPIRED", "This collection code has expired.", 410],
  CANCELLED: ["CANCELLED", "This order was cancelled.", 410],
};

/** Finds the most recent paid order for a code (codes can be reused after an order ends). */
async function findByCode(db: Db, code: string): Promise<Order | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.collectionCode, code))
    .orderBy(desc(orders.paidAt))
    .limit(1);
  return order ?? null;
}

async function kioskOrderView(db: Db, order: Order) {
  const items = await loadOrderItems(db, order.id);
  return {
    orderId: order.id,
    orderRef: order.orderRef,
    status: order.status,
    totalPrice: order.totalPrice,
    paidAt: order.paidAt?.toISOString() ?? null,
    expiresAt: order.expiresAt.toISOString(),
    totalPrintedPages: items.reduce((s, i) => s + i.printedPages, 0),
    files: items.map((i) => ({
      fileId: i.fileId,
      name: i.name,
      format: i.format,
      pageCount: i.pageCount,
      downloadPath: `/api/kiosk/orders/${order.id}/files/${i.fileId}`,
      settings: {
        paperSize: i.paperSize,
        colorMode: i.colorMode,
        copies: i.copies,
        pages: i.pageSelection,
        selectedPageCount: i.selectedPageCount,
        printedPages: i.printedPages,
      },
    })),
  };
}

/** Step 1: verify a code. Read-only (except logging). */
export async function lookupByCode(kioskId: string, rawCode: unknown) {
  const db = await getDb();
  await assertNotRateLimited(db, kioskId);
  const code = normalizeCollectionCode(rawCode);
  const found = code ? await findByCode(db, code) : null;
  if (!found) {
    await log(db, { kioskId, action: "LOOKUP", result: "INVALID_CODE", code: typeof rawCode === "string" ? rawCode.slice(0, 20) : null });
    throw new AppError("INVALID_CODE", "We couldn't find an order with this code. Please check and try again.", 404);
  }
  const order = await expireIfNeeded(db, found);
  const err = STATUS_ERRORS[order.status];
  if (err) {
    await log(db, { kioskId, action: "LOOKUP", result: err[0], orderId: order.id, code });
    throw new AppError(err[0], err[1], err[2]);
  }
  await log(db, { kioskId, action: "LOOKUP", result: "OK", orderId: order.id, code });
  return kioskOrderView(db, order);
}

/** Step 2: atomically take the order (PAID → PROCESSING). Only one kiosk can win. */
export async function claimOrder(kioskId: string, orderId: string, rawCode: unknown) {
  if (!isUuid(orderId)) throw new AppError("ORDER_NOT_FOUND", "Order not found.", 404);
  const db = await getDb();
  const code = normalizeCollectionCode(rawCode);
  const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current || !code || current.collectionCode !== code) {
    await log(db, { kioskId, action: "CLAIM", result: "INVALID_CODE", orderId: current?.id, code });
    throw new AppError("INVALID_CODE", "The code does not match this order.", 404);
  }
  const fresh = await expireIfNeeded(db, current);

  const [claimed] = await db
    .update(orders)
    .set({ status: "PROCESSING", processingAt: new Date(), claimedByKiosk: kioskId })
    .where(and(eq(orders.id, orderId), eq(orders.status, "PAID")))
    .returning();

  if (!claimed) {
    const [latest] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const status = latest?.status ?? fresh.status;
    const err = STATUS_ERRORS[status] ?? ["ORDER_NOT_CLAIMABLE", "This order can't be printed right now.", 409];
    await log(db, { kioskId, action: "CLAIM", result: err[0], orderId, code });
    throw new AppError(err[0], err[1], err[2]);
  }
  await log(db, { kioskId, action: "CLAIM", result: "OK", orderId, code });
  return kioskOrderView(db, claimed);
}

async function requireOrder(db: Db, orderId: string) {
  if (!isUuid(orderId)) throw new AppError("ORDER_NOT_FOUND", "Order not found.", 404);
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new AppError("ORDER_NOT_FOUND", "Order not found.", 404);
  return order;
}

/** Step 3: stream a file. Only while PROCESSING and only to the kiosk that claimed it. */
export async function getFileForKiosk(kioskId: string, orderId: string, fileId: string) {
  const db = await getDb();
  const order = await requireOrder(db, orderId);
  if (order.status !== "PROCESSING" || order.claimedByKiosk !== kioskId) {
    await log(db, { kioskId, action: "DOWNLOAD", result: "NOT_CLAIMED", orderId });
    throw new AppError("NOT_CLAIMED", "Claim this order before downloading its files.", 409);
  }
  if (!isUuid(fileId)) throw new AppError("FILE_NOT_FOUND", "File not found.", 404);
  const [file] = await db
    .select()
    .from(uploadedFiles)
    .where(and(eq(uploadedFiles.id, fileId), eq(uploadedFiles.orderId, orderId)))
    .limit(1);
  if (!file || file.deletedAt) throw new AppError("FILE_NOT_FOUND", "File not found.", 404);
  const bytes = await readObject(file.storageKey);
  if (!bytes) {
    await log(db, { kioskId, action: "DOWNLOAD", result: "STORAGE_MISSING", orderId, error: file.id });
    throw new AppError("FILE_NOT_FOUND", "The file is missing from storage.", 404);
  }
  await log(db, { kioskId, action: "DOWNLOAD", result: "OK", orderId });
  return { file, bytes };
}

/** Step 4: PROCESSING → COMPLETED. Idempotent for the same kiosk. */
export async function completeOrder(kioskId: string, orderId: string) {
  const db = await getDb();
  const order = await requireOrder(db, orderId);
  if (order.status === "COMPLETED" && order.claimedByKiosk === kioskId) {
    return { orderId, status: "COMPLETED" as const, completedAt: order.completedAt!.toISOString() };
  }
  const [done] = await db
    .update(orders)
    .set({ status: "COMPLETED", completedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, "PROCESSING"), eq(orders.claimedByKiosk, kioskId)))
    .returning();
  if (!done) {
    await log(db, { kioskId, action: "COMPLETE", result: "NOT_CLAIMED", orderId });
    throw new AppError("NOT_CLAIMED", "This order isn't being printed by this kiosk.", 409);
  }
  await log(db, { kioskId, action: "COMPLETE", result: "OK", orderId });
  return { orderId, status: "COMPLETED" as const, completedAt: done.completedAt!.toISOString() };
}

/**
 * Step 4 (failure): retryable problems (paper jam, kiosk offline) return the order to PAID
 * so the customer can try again; otherwise it becomes FAILED.
 */
export async function failOrder(kioskId: string, orderId: string, reason: unknown, retryable: unknown) {
  const db = await getDb();
  await requireOrder(db, orderId);
  const why = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : "Unspecified kiosk error";
  const canRetry = retryable === true;
  const [updated] = await db
    .update(orders)
    .set(
      canRetry
        ? { status: "PAID", claimedByKiosk: null, processingAt: null, failureReason: why }
        : { status: "FAILED", failureReason: why },
    )
    .where(and(eq(orders.id, orderId), eq(orders.status, "PROCESSING"), eq(orders.claimedByKiosk, kioskId)))
    .returning();
  if (!updated) {
    await log(db, { kioskId, action: "FAIL", result: "NOT_CLAIMED", orderId, error: why });
    throw new AppError("NOT_CLAIMED", "This order isn't being printed by this kiosk.", 409);
  }
  await log(db, { kioskId, action: "FAIL", result: canRetry ? "RETRYABLE" : "FAILED", orderId, error: why });
  return { orderId, status: updated.status };
}
