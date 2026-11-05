import { and, eq, isNull } from "drizzle-orm";
import { EXPIRY, LIMITS } from "../config";
import { generateCollectionCode, generateOrderRef, generateSecretToken, safeEqualHex, sha256Hex } from "../codes";
import { type Db, getDb } from "../db";
import { type Order, type UploadedFile, orders, payments, printSettings, uploadedFiles } from "../db/schema";
import { AppError } from "../errors";
import { DEFAULT_ADJUSTMENT, type ImageAdjustment, isDefaultAdjustment, sanitizeAdjustment } from "../image-layout";
import { parsePageSelection } from "../pages";
import { type ColorMode, priceLine } from "../pricing";
import { extractPdfPages, renderImagePrintPdf } from "../print-render";
import { deleteObject, newPrintKey, putObject, readObject } from "../storage";
import { getActivePrices } from "./pricing";

/** One document per order. */
export interface OrderInput {
  fileId: string;
  colorMode: ColorMode;
  copies: number;
  /** PDFs: "all" or a range list. Images: always "all". */
  pageSelection: string;
  /** JPG/PNG only. Omitted = fit to A4, no crop/rotation. */
  imageAdjustment?: ImageAdjustment;
}

export interface OrderItemView {
  fileId: string;
  name: string;
  format: "PDF" | "JPG" | "PNG";
  pageCount: number;
  paperSize: "A4";
  colorMode: ColorMode;
  copies: number;
  pageSelection: string;
  selectedPageCount: number;
  pricePerPage: number;
  printedPages: number;
  subtotal: number;
  imageAdjustment: ImageAdjustment | null;
  /** True when the image was cropped, rotated, zoomed or moved. */
  imageAdjusted: boolean;
}

export interface OrderView {
  id: string;
  orderRef: string;
  status: Order["status"];
  paymentStatus: Order["paymentStatus"];
  totalPrice: number;
  totalPrintedPages: number;
  collectionCode: string | null;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  /** Always exactly one item (one document per order). */
  items: OrderItemView[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const HOUR = 60 * 60 * 1000;

/** Unique-violation detection that works for node-postgres and PGlite. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function validateInput(raw: unknown): OrderInput & { rawAdjustment: unknown } {
  if (Array.isArray(raw)) {
    throw new AppError("ONE_FILE_ONLY", `Each order can contain ${LIMITS.filesPerOrder} document. Please place a separate order for each file.`);
  }
  const item = (raw ?? {}) as Partial<OrderInput>;
  if (!isUuid(item.fileId)) throw new AppError("NO_FILE", "Please upload a document first.");
  if (item.colorMode !== "BW" && item.colorMode !== "COLOR") {
    throw new AppError("INVALID_MODE", "Please choose Black & White or Color.");
  }
  if (!Number.isInteger(item.copies) || item.copies! < LIMITS.minCopies || item.copies! > LIMITS.maxCopies) {
    throw new AppError("INVALID_COPIES", `Copies must be between ${LIMITS.minCopies} and ${LIMITS.maxCopies}.`);
  }
  const pageSelection = item.pageSelection ?? "all";
  if (typeof pageSelection !== "string" || pageSelection.length > 200) {
    throw new AppError("INVALID_PAGES", "Please check the pages you selected.");
  }
  return {
    fileId: item.fileId,
    colorMode: item.colorMode,
    copies: item.copies!,
    pageSelection,
    rawAdjustment: item.imageAdjustment,
  };
}

interface PrintOutput {
  key: string;
  /** True when we created a new object (so it must be cleaned up if the order isn't saved). */
  created: boolean;
  mimeType: string;
  pageCount: number;
  pages: string;
  sha256: string;
}

/**
 * Builds the file the kiosk will print:
 * - JPG/PNG → single-page A4 PDF rendered from the customer's adjustment (original kept separately)
 * - PDF with selected pages → PDF containing only those pages
 * - whole PDF → the original file
 */
async function buildPrintOutput(file: UploadedFile, selection: { normalized: string; pages: number[] }, adjustment: ImageAdjustment | null): Promise<PrintOutput> {
  if (file.format === "PDF" && selection.normalized === "all") {
    return { key: file.storageKey, created: false, mimeType: "application/pdf", pageCount: file.pageCount, pages: "all", sha256: file.sha256 };
  }
  const bytes = await readObject(file.storageKey);
  if (!bytes) throw new AppError("FILE_UNAVAILABLE", "Your file is no longer available. Please upload it again.", 409);

  let output: Uint8Array;
  if (file.format === "PDF") {
    try {
      output = await extractPdfPages(bytes, selection.pages);
    } catch (err) {
      // Fall back to the original PDF + page list; the kiosk prints just those pages.
      console.warn("[printnow] page extraction failed, using original PDF", err);
      return { key: file.storageKey, created: false, mimeType: "application/pdf", pageCount: file.pageCount, pages: selection.normalized, sha256: file.sha256 };
    }
  } else {
    if (!file.imageWidth || !file.imageHeight) {
      throw new AppError("FILE_UNAVAILABLE", "Your image needs to be uploaded again.", 409);
    }
    try {
      output = await renderImagePrintPdf({
        bytes,
        format: file.format,
        rawWidth: file.imageWidth,
        rawHeight: file.imageHeight,
        exifOrientation: file.exifOrientation ?? 1,
        adjustment: adjustment ?? DEFAULT_ADJUSTMENT,
      });
    } catch (err) {
      console.error("[printnow] image render failed", err);
      throw new AppError("IMAGE_RENDER_FAILED", "We couldn't prepare this image for printing. Please try a different image.", 422);
    }
  }
  const key = newPrintKey();
  await putObject(key, output, "application/pdf");
  return {
    key,
    created: true,
    mimeType: "application/pdf",
    pageCount: file.format === "PDF" ? selection.pages.length : 1,
    pages: "all",
    sha256: sha256Hex(output),
  };
}

/**
 * Creates an order in PENDING_PAYMENT for exactly one document. The server recalculates
 * the price and builds the print-ready file; nothing price-related is accepted from the browser.
 * Returns the raw access token once — only its hash is stored.
 */
export async function createOrder(raw: unknown) {
  const input = validateInput(raw);
  const prices = await getActivePrices();
  const db = await getDb();

  const [file] = await db
    .select()
    .from(uploadedFiles)
    .where(and(eq(uploadedFiles.id, input.fileId), isNull(uploadedFiles.orderId), isNull(uploadedFiles.deletedAt)))
    .limit(1);
  if (!file) throw new AppError("FILE_UNAVAILABLE", "Your file is no longer available. Please upload it again.", 409);

  const isImage = file.format === "JPG" || file.format === "PNG";
  const selection = parsePageSelection(isImage ? "all" : input.pageSelection, file.pageCount);
  if (!selection.ok) throw new AppError("INVALID_PAGES", selection.error);

  let adjustment: ImageAdjustment | null = null;
  if (isImage) {
    try {
      adjustment = input.rawAdjustment === undefined ? DEFAULT_ADJUSTMENT : sanitizeAdjustment(input.rawAdjustment);
    } catch (err) {
      throw new AppError("INVALID_ADJUSTMENT", err instanceof Error ? err.message : "Invalid image adjustment.");
    }
  }

  const price = priceLine(prices, { selectedPageCount: selection.count, copies: input.copies, colorMode: input.colorMode });
  const print = await buildPrintOutput(file, selection, adjustment);
  const accessToken = generateSecretToken();

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const orderId = await db.transaction(async (tx) => {
          const [order] = await tx
            .insert(orders)
            .values({
              orderRef: generateOrderRef(),
              totalPrice: price.subtotal,
              accessTokenHash: sha256Hex(accessToken),
              expiresAt: new Date(Date.now() + EXPIRY.unpaidHours * HOUR),
            })
            .returning({ id: orders.id });

          const claimed = await tx
            .update(uploadedFiles)
            .set({ orderId: order.id })
            .where(and(eq(uploadedFiles.id, file.id), isNull(uploadedFiles.orderId)))
            .returning({ id: uploadedFiles.id });
          if (claimed.length !== 1) {
            throw new AppError("FILE_UNAVAILABLE", "This file is already part of another order. Please upload it again.", 409);
          }

          await tx.insert(printSettings).values({
            orderId: order.id,
            fileId: file.id,
            position: 0,
            paperSize: "A4",
            colorMode: input.colorMode,
            copies: input.copies,
            pageSelection: selection.normalized,
            selectedPageCount: selection.count,
            pricePerPage: price.pricePerPage,
            printedPages: price.printedPages,
            subtotal: price.subtotal,
            imageAdjustment: adjustment,
            printStorageKey: print.key,
            printMimeType: print.mimeType,
            printPageCount: print.pageCount,
            printPages: print.pages,
            printSha256: print.sha256,
          });
          return order.id;
        });
        return { orderId, accessToken };
      } catch (err) {
        // Retry only on a (very unlikely) order reference collision.
        if (isUniqueViolation(err) && attempt < 4) continue;
        throw err;
      }
    }
    throw new AppError("ORDER_FAILED", "We couldn't create your order. Please try again.", 500);
  } catch (err) {
    if (print.created) await deleteObject(print.key).catch(() => undefined);
    throw err;
  }
}

async function loadOrder(db: Db, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ?? null;
}

export async function loadOrderRows(db: Db, orderId: string) {
  return db
    .select({ s: printSettings, f: uploadedFiles })
    .from(printSettings)
    .innerJoin(uploadedFiles, eq(printSettings.fileId, uploadedFiles.id))
    .where(eq(printSettings.orderId, orderId))
    .limit(LIMITS.filesPerOrder);
}

export async function loadOrderItems(db: Db, orderId: string): Promise<OrderItemView[]> {
  const rows = await loadOrderRows(db, orderId);
  return rows.map(({ s, f }) => ({
    fileId: f.id,
    name: f.originalName,
    format: f.format,
    pageCount: f.pageCount,
    paperSize: s.paperSize,
    colorMode: s.colorMode,
    copies: s.copies,
    pageSelection: s.pageSelection,
    selectedPageCount: s.selectedPageCount,
    pricePerPage: s.pricePerPage,
    printedPages: s.printedPages,
    subtotal: s.subtotal,
    imageAdjustment: s.imageAdjustment ?? null,
    imageAdjusted: !!s.imageAdjustment && !isDefaultAdjustment(s.imageAdjustment),
  }));
}

/** Marks PENDING_PAYMENT / PAID orders past their expiry as EXPIRED. Returns the fresh row. */
export async function expireIfNeeded(db: Db, order: Order): Promise<Order> {
  if ((order.status === "PENDING_PAYMENT" || order.status === "PAID") && order.expiresAt.getTime() <= Date.now()) {
    const [updated] = await db
      .update(orders)
      .set({ status: "EXPIRED" })
      .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
      .returning();
    return updated ?? (await loadOrder(db, order.id)) ?? order;
  }
  return order;
}

function tokenMatches(order: Order, token: string | undefined | null): boolean {
  return !!token && safeEqualHex(order.accessTokenHash, sha256Hex(token));
}

export async function toOrderView(db: Db, order: Order): Promise<OrderView> {
  const items = await loadOrderItems(db, order.id);
  const showCode = order.paymentStatus === "PAID" && order.status !== "EXPIRED";
  return {
    id: order.id,
    orderRef: order.orderRef,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalPrice: order.totalPrice,
    totalPrintedPages: items.reduce((s, i) => s + i.printedPages, 0),
    collectionCode: showCode ? order.collectionCode : null,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    expiresAt: order.expiresAt.toISOString(),
    items,
  };
}

/** Returns the order only if the caller holds its access token. */
export async function getOrderForCustomer(orderId: string, token: string | undefined | null): Promise<OrderView | null> {
  if (!isUuid(orderId)) return null;
  const db = await getDb();
  const order = await loadOrder(db, orderId);
  if (!order || !tokenMatches(order, token)) return null;
  return toOrderView(db, await expireIfNeeded(db, order));
}

/**
 * Simulated QRIS payment. Atomic and idempotent:
 * repeating the call returns the same collection code and never double-charges.
 */
export async function payOrder(orderId: string, token: string | undefined | null) {
  if (!isUuid(orderId)) throw new AppError("ORDER_NOT_FOUND", "Order not found.", 404);
  const db = await getDb();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || !tokenMatches(order, token)) throw new AppError("ORDER_NOT_FOUND", "Order not found.", 404);

    if (order.paymentStatus === "PAID") {
      return { collectionCode: order.collectionCode!, alreadyPaid: true };
    }
    if (order.status !== "PENDING_PAYMENT") {
      throw new AppError("ORDER_NOT_PAYABLE", "This order can no longer be paid. Please start a new order.", 409);
    }
    if (order.expiresAt.getTime() <= Date.now()) {
      await tx.update(orders).set({ status: "EXPIRED" }).where(eq(orders.id, order.id));
      return { expired: true as const };
    }

    const now = new Date();
    await tx.insert(payments).values({
      orderId: order.id,
      paymentType: "DUMMY_QRIS",
      amount: order.totalPrice,
      simulationStatus: "SIMULATED_SUCCESS",
      paidAt: now,
    });

    // Assign a code that is unique among active orders. Each try runs in a savepoint so a
    // collision on the unique index doesn't abort the whole payment transaction.
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateCollectionCode();
      try {
        await tx.transaction(async (sp) => {
          await sp
            .update(orders)
            .set({
              collectionCode: code,
              status: "PAID",
              paymentStatus: "PAID",
              paidAt: now,
              expiresAt: new Date(now.getTime() + EXPIRY.paidDays * 24 * HOUR),
            })
            .where(eq(orders.id, order.id));
        });
        return { collectionCode: code, alreadyPaid: false };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new AppError("CODE_GENERATION_FAILED", "We couldn't complete the payment. Please try again.", 503);
  }).then((result) => {
    if ("expired" in result) {
      throw new AppError("ORDER_EXPIRED", "This order has expired. Please start a new order.", 410);
    }
    return result;
  });
}

export async function cancelOrder(orderId: string, token: string | undefined | null) {
  if (!isUuid(orderId)) throw new AppError("ORDER_NOT_FOUND", "Order not found.", 404);
  const db = await getDb();
  const order = await loadOrder(db, orderId);
  if (!order || !tokenMatches(order, token)) throw new AppError("ORDER_NOT_FOUND", "Order not found.", 404);
  if (order.status === "CANCELLED") return;
  const [updated] = await db
    .update(orders)
    .set({ status: "CANCELLED" })
    .where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_PAYMENT")))
    .returning({ id: orders.id });
  if (!updated) throw new AppError("ORDER_NOT_CANCELLABLE", "Only unpaid orders can be cancelled.", 409);
}
