import { and, count, desc, eq, gte } from "drizzle-orm";
import { KIOSK } from "../config";
import { PDFDocument } from "pdf-lib";
import { normalizeCollectionCode, sha256Hex } from "../codes";
import { type Db, getDb } from "../db";
import { type Order, kioskLogs, orders, printSettings, uploadedFiles } from "../db/schema";
import { AppError } from "../errors";
import { parsePageSelection } from "../pages";
import type { PrintJob } from "../kiosk/types";
import { readObject } from "../storage";
import { expireIfNeeded, isUuid, loadOrderRows } from "./orders";

export type { PrintJob };

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
  const rows = await loadOrderRows(db, order.id);
  return {
    orderId: order.id,
    orderRef: order.orderRef,
    status: order.status,
    totalPrice: order.totalPrice,
    paidAt: order.paidAt?.toISOString() ?? null,
    expiresAt: order.expiresAt.toISOString(),
    totalPrintedPages: rows.reduce((sum, r) => sum + r.s.printedPages, 0),
    // Exactly one document per order; kept as an array for a stable response shape.
    files: rows.map(({ s, f }) => {
      const base = `/api/kiosk/orders/${order.id}/files/${f.id}`;
      const hasPrint = !!s.printStorageKey;
      return {
        fileId: f.id,
        name: f.originalName,
        format: f.format,
        pageCount: f.pageCount,
        /** What to print. Same as print.downloadPath. */
        downloadPath: `${base}?variant=${hasPrint ? "print" : "original"}`,
        print: hasPrint
          ? {
              downloadPath: `${base}?variant=print`,
              mimeType: s.printMimeType,
              pageCount: s.printPageCount,
              /** Pages of THIS file to print: "all", or a range list if the server couldn't extract them. */
              pages: s.printPages,
              sha256: s.printSha256,
            }
          : null,
        original: {
          downloadPath: `${base}?variant=original`,
          mimeType: f.mimeType,
          pageCount: f.pageCount,
          sha256: f.sha256,
        },
        settings: {
          paperSize: s.paperSize,
          colorMode: s.colorMode,
          copies: s.copies,
          pages: s.pageSelection,
          selectedPageCount: s.selectedPageCount,
          printedPages: s.printedPages,
          imageAdjustment: s.imageAdjustment ?? null,
        },
      };
    }),
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

export type FileVariant = "print" | "original";

/**
 * Step 3: find the file to download. Only while PROCESSING and only for the kiosk that claimed it.
 * Returns where the bytes live; the route decides how to deliver them.
 */
export async function getFileForKiosk(kioskId: string, orderId: string, fileId: string, variant: FileVariant = "print") {
  const db = await getDb();
  const order = await requireOrder(db, orderId);
  if (order.status !== "PROCESSING" || order.claimedByKiosk !== kioskId) {
    await log(db, { kioskId, action: "DOWNLOAD", result: "NOT_CLAIMED", orderId });
    throw new AppError("NOT_CLAIMED", "Claim this order before downloading its files.", 409);
  }
  if (!isUuid(fileId)) throw new AppError("FILE_NOT_FOUND", "File not found.", 404);
  const [row] = await db
    .select({ f: uploadedFiles, s: printSettings })
    .from(uploadedFiles)
    .innerJoin(printSettings, eq(printSettings.fileId, uploadedFiles.id))
    .where(and(eq(uploadedFiles.id, fileId), eq(uploadedFiles.orderId, orderId)))
    .limit(1);
  if (!row || row.f.deletedAt) throw new AppError("FILE_NOT_FOUND", "File not found.", 404);
  const { f, s } = row;
  const usePrint = variant === "print" && !!s.printStorageKey;
  const base = f.originalName.replace(/\.[^.]+$/, "");
  const descriptor = usePrint
    ? {
        storageKey: s.printStorageKey!,
        mimeType: s.printMimeType ?? "application/pdf",
        sha256: s.printSha256 ?? "",
        fileName: `${base}-print.pdf`,
        variant: "print" as const,
      }
    : { storageKey: f.storageKey, mimeType: f.mimeType, sha256: f.sha256, fileName: f.originalName, variant: "original" as const };
  await log(db, { kioskId, action: "DOWNLOAD", result: `OK_${descriptor.variant.toUpperCase()}`, orderId });
  return descriptor;
}

/** Step 4: PROCESSING → COMPLETED. Idempotent for the same kiosk. */
export async function completeOrder(kioskId: string, orderId: string, opts: { simulated?: boolean } = {}) {
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
  await log(db, { kioskId, action: "COMPLETE", result: opts.simulated ? "OK_SIMULATED" : "OK", orderId });
  return { orderId, status: "COMPLETED" as const, completedAt: done.completedAt!.toISOString() };
}

/**
 * Step 4 (failure): retryable problems (paper jam, kiosk offline) return the order to PAID
 * so the customer can try again; otherwise it becomes FAILED.
 */
export async function failOrder(
  kioskId: string,
  orderId: string,
  reason: unknown,
  retryable: unknown,
  opts: { simulated?: boolean } = {},
) {
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
  const result = `${opts.simulated ? "SIMULATED_" : ""}${canRetry ? "RETRYABLE" : "FAILED"}`;
  await log(db, { kioskId, action: "FAIL", result, orderId, error: why });
  // Also in the hosting logs, so a stopped print can be diagnosed without database access.
  console.warn(`[printnow] kiosk ${kioskId} print stopped for ${updated.orderRef} (${result}): ${why}`);
  return { orderId, status: updated.status };
}

/**
 * Kiosk step 3 (for the touchscreen kiosk): retrieve the ACTUAL print-ready file, check it is
 * intact (SHA-256 + opens as a PDF with the expected page count) and turn the stored settings
 * into a print job. A missing or damaged file marks the order FAILED with a reason.
 */
export async function prepareJob(kioskId: string, orderId: string): Promise<PrintJob> {
  const db = await getDb();
  const order = await requireOrder(db, orderId);
  if (order.status !== "PROCESSING" || order.claimedByKiosk !== kioskId) {
    await log(db, { kioskId, action: "DOWNLOAD", result: "NOT_CLAIMED", orderId });
    throw new AppError("NOT_CLAIMED", "Claim this order before printing it.", 409);
  }
  const [row] = await db
    .select({ f: uploadedFiles, s: printSettings })
    .from(printSettings)
    .innerJoin(uploadedFiles, eq(printSettings.fileId, uploadedFiles.id))
    .where(eq(printSettings.orderId, orderId))
    .limit(1);

  const broken = async (detail: string): Promise<never> => {
    await log(db, { kioskId, action: "DOWNLOAD", result: "FILE_INVALID", orderId, error: detail });
    await failOrder(kioskId, orderId, `Print file problem: ${detail}`, false);
    throw new AppError("PRINT_FILE_INVALID", "This document can't be printed. Please contact support with your order reference.", 422);
  };

  if (!row || row.f.deletedAt || !row.s.printStorageKey) return broken("print file missing");
  const { f, s } = row;
  const bytes = await readObject(s.printStorageKey!);
  if (!bytes) return broken("print file not in storage");
  if (s.printSha256 && sha256Hex(bytes) !== s.printSha256) return broken("checksum mismatch");

  let pageCount: number;
  try {
    pageCount = (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
  } catch {
    return broken("print file is not a readable PDF");
  }
  if (s.printPageCount && pageCount !== s.printPageCount) return broken(`page count ${pageCount} ≠ ${s.printPageCount}`);

  const selection = parsePageSelection(s.printPages ?? "all", pageCount);
  if (!selection.ok) return broken(`invalid page list "${s.printPages}"`);

  // Map print-file pages back to the customer's original page numbers (the print file may
  // contain only the selected pages).
  const original = parsePageSelection(s.pageSelection, f.pageCount);
  const originalPages =
    original.ok && original.pages.length === selection.pages.length && (s.printPages ?? "all") === "all"
      ? original.pages
      : selection.pages;

  await log(db, { kioskId, action: "DOWNLOAD", result: "OK_PREPARED", orderId });
  return {
    orderId,
    orderRef: order.orderRef,
    fileId: f.id,
    fileName: f.originalName,
    originalFormat: f.format,
    paperSize: s.paperSize,
    colorMode: s.colorMode,
    copies: s.copies,
    pages: selection.pages,
    originalPages,
    printFilePageCount: pageCount,
    totalSheets: selection.pages.length * s.copies,
    sha256: s.printSha256 ?? sha256Hex(bytes),
    sizeBytes: bytes.length,
  };
}

/** The order this kiosk was printing when it stopped (e.g. iPad closed mid-print), if any. */
export async function getActiveJobForKiosk(kioskId: string) {
  const db = await getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "PROCESSING"), eq(orders.claimedByKiosk, kioskId)))
    .orderBy(desc(orders.processingAt))
    .limit(1);
  return order ? kioskOrderView(db, order) : null;
}
