import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { EXPIRY, LIMITS } from "../config";
import { generateCollectionCode, generateOrderRef, generateSecretToken, safeEqualHex, sha256Hex } from "../codes";
import { type Db, getDb } from "../db";
import { type Order, orders, payments, printSettings, uploadedFiles } from "../db/schema";
import { AppError } from "../errors";
import { parsePageSelection } from "../pages";
import { type ColorMode, priceLine } from "../pricing";
import { getActivePrices } from "./pricing";

export interface OrderItemInput {
  fileId: string;
  colorMode: ColorMode;
  copies: number;
  pageSelection: string;
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

function validateItems(items: unknown): OrderItemInput[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("NO_FILES", "Please add at least one file to your order.");
  }
  if (items.length > LIMITS.maxFilesPerOrder) {
    throw new AppError("TOO_MANY_FILES", `You can print up to ${LIMITS.maxFilesPerOrder} files per order.`);
  }
  const seen = new Set<string>();
  return items.map((raw) => {
    const item = raw as Partial<OrderItemInput>;
    if (!isUuid(item?.fileId)) throw new AppError("INVALID_FILE", "One of the files is invalid. Please upload it again.");
    if (seen.has(item.fileId)) throw new AppError("DUPLICATE_FILE", "The same file was added twice.");
    seen.add(item.fileId);
    if (item.colorMode !== "BW" && item.colorMode !== "COLOR") {
      throw new AppError("INVALID_MODE", "Please choose Black & White or Color.");
    }
    if (!Number.isInteger(item.copies) || item.copies! < LIMITS.minCopies || item.copies! > LIMITS.maxCopies) {
      throw new AppError("INVALID_COPIES", `Copies must be between ${LIMITS.minCopies} and ${LIMITS.maxCopies}.`);
    }
    if (typeof item.pageSelection !== "string" || item.pageSelection.length > 200) {
      throw new AppError("INVALID_PAGES", "Please check the pages you selected.");
    }
    return { fileId: item.fileId, colorMode: item.colorMode, copies: item.copies!, pageSelection: item.pageSelection };
  });
}

/**
 * Creates an order in PENDING_PAYMENT. The server recalculates every price;
 * nothing price-related is accepted from the browser.
 * Returns the raw access token once — only its hash is stored.
 */
export async function createOrder(rawItems: unknown) {
  const items = validateItems(rawItems);
  const prices = await getActivePrices();
  const db = await getDb();
  const accessToken = generateSecretToken();

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const orderId = await db.transaction(async (tx) => {
        const fileIds = items.map((i) => i.fileId);
        const files = await tx
          .select()
          .from(uploadedFiles)
          .where(and(inArray(uploadedFiles.id, fileIds), isNull(uploadedFiles.orderId), isNull(uploadedFiles.deletedAt)));
        const byId = new Map(files.map((f) => [f.id, f]));

        const lines = items.map((item, position) => {
          const file = byId.get(item.fileId);
          if (!file) {
            throw new AppError("FILE_UNAVAILABLE", "One of your files is no longer available. Please upload it again.", 409);
          }
          const selection = parsePageSelection(item.pageSelection, file.pageCount);
          if (!selection.ok) {
            throw new AppError("INVALID_PAGES", `${file.originalName}: ${selection.error}`);
          }
          const price = priceLine(prices, {
            selectedPageCount: selection.count,
            copies: item.copies,
            colorMode: item.colorMode,
          });
          return { item, file, position, selection, price };
        });

        const total = lines.reduce((s, l) => s + l.price.subtotal, 0);
        const [order] = await tx
          .insert(orders)
          .values({
            orderRef: generateOrderRef(),
            totalPrice: total,
            accessTokenHash: sha256Hex(accessToken),
            expiresAt: new Date(Date.now() + EXPIRY.unpaidHours * HOUR),
          })
          .returning({ id: orders.id });

        const claimed = await tx
          .update(uploadedFiles)
          .set({ orderId: order.id })
          .where(and(inArray(uploadedFiles.id, fileIds), isNull(uploadedFiles.orderId)))
          .returning({ id: uploadedFiles.id });
        if (claimed.length !== fileIds.length) {
          throw new AppError("FILE_UNAVAILABLE", "One of your files is already part of another order. Please upload it again.", 409);
        }

        await tx.insert(printSettings).values(
          lines.map((l) => ({
            orderId: order.id,
            fileId: l.file.id,
            position: l.position,
            paperSize: "A4" as const,
            colorMode: l.item.colorMode,
            copies: l.item.copies,
            pageSelection: l.selection.normalized,
            selectedPageCount: l.selection.count,
            pricePerPage: l.price.pricePerPage,
            printedPages: l.price.printedPages,
            subtotal: l.price.subtotal,
          })),
        );
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
}

async function loadOrder(db: Db, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ?? null;
}

export async function loadOrderItems(db: Db, orderId: string): Promise<OrderItemView[]> {
  const rows = await db
    .select({ s: printSettings, f: uploadedFiles })
    .from(printSettings)
    .innerJoin(uploadedFiles, eq(printSettings.fileId, uploadedFiles.id))
    .where(eq(printSettings.orderId, orderId))
    .orderBy(asc(printSettings.position));
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
