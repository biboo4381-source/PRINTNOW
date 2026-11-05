import { and, eq, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { EXPIRY } from "../config";
import { getDb } from "../db";
import { orders, printSettings, uploadedFiles } from "../db/schema";
import { deleteObject } from "../storage";

const HOUR = 60 * 60 * 1000;

/**
 * Daily housekeeping (Vercel Cron → /api/cron/cleanup):
 * 1. Expire unpaid / uncollected orders past expires_at.
 * 2. Delete stored files of finished orders after the retention period,
 *    and uploads that were never attached to an order.
 */
export async function runCleanup(now = new Date()) {
  const db = await getDb();
  const retentionCutoff = new Date(now.getTime() - EXPIRY.fileRetentionHours * HOUR);

  const expired = await db
    .update(orders)
    .set({ status: "EXPIRED" })
    .where(and(inArray(orders.status, ["PENDING_PAYMENT", "PAID"]), lte(orders.expiresAt, now)))
    .returning({ id: orders.id });

  const finishedOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      or(
        inArray(orders.status, ["EXPIRED", "CANCELLED"]),
        and(inArray(orders.status, ["COMPLETED", "FAILED"]), lt(orders.completedAt, retentionCutoff)),
        and(eq(orders.status, "FAILED"), isNull(orders.completedAt), lt(orders.createdAt, retentionCutoff)),
      ),
    );
  const finishedIds = finishedOrders.map((o) => o.id);

  const candidates = await db
    .select({ id: uploadedFiles.id, storageKey: uploadedFiles.storageKey })
    .from(uploadedFiles)
    .where(
      and(
        isNull(uploadedFiles.deletedAt),
        or(
          and(isNull(uploadedFiles.orderId), lt(uploadedFiles.uploadedAt, retentionCutoff)),
          finishedIds.length ? inArray(uploadedFiles.orderId, finishedIds) : undefined,
        ),
      ),
    );

  let deletedFiles = 0;
  const errors: string[] = [];
  for (const file of candidates) {
    try {
      await deleteObject(file.storageKey);
      await db.update(uploadedFiles).set({ deletedAt: now }).where(eq(uploadedFiles.id, file.id));
      deletedFiles++;
    } catch (err) {
      errors.push(`${file.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Generated print-ready files (only those that are separate objects from the original upload).
  if (finishedIds.length) {
    const prints = await db
      .select({ id: printSettings.id, key: printSettings.printStorageKey })
      .from(printSettings)
      .innerJoin(uploadedFiles, eq(printSettings.fileId, uploadedFiles.id))
      .where(
        and(
          inArray(printSettings.orderId, finishedIds),
          isNotNull(printSettings.printStorageKey),
          ne(printSettings.printStorageKey, uploadedFiles.storageKey),
        ),
      );
    for (const p of prints) {
      try {
        await deleteObject(p.key!);
        await db.update(printSettings).set({ printStorageKey: null }).where(eq(printSettings.id, p.id));
        deletedFiles++;
      } catch (err) {
        errors.push(`print ${p.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { expiredOrders: expired.length, deletedFiles, errors };
}
