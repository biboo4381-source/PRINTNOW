import { eq } from "drizzle-orm";
import { LIMITS } from "../config";
import { sha256Hex } from "../codes";
import { getDb } from "../db";
import { uploadedFiles } from "../db/schema";
import { AppError } from "../errors";
import { MIME_BY_FORMAT, inspectPdf, sanitizeFileName, sniffFormat } from "../files";
import { displayedSize } from "../image-layout";
import { readImageMeta } from "../image-meta";
import { deleteObject, isValidUploadKey, readObject } from "../storage";

export interface VerifiedFile {
  id: string;
  name: string;
  format: "PDF" | "JPG" | "PNG";
  sizeBytes: number;
  pageCount: number;
  /** Images: size as displayed (after camera orientation), used for the A4 preview. */
  imageWidth: number | null;
  imageHeight: number | null;
}

/**
 * Server-side, authoritative check of a file the browser just uploaded.
 * Reads the stored bytes, checks the real type and size, counts PDF pages,
 * and records it. Invalid files are deleted from storage.
 */
export async function verifyUploadedFile(storageKey: unknown, originalName: unknown): Promise<VerifiedFile> {
  if (!isValidUploadKey(storageKey)) {
    throw new AppError("INVALID_UPLOAD", "We couldn't find that upload. Please upload the file again.", 400);
  }
  const name = sanitizeFileName(typeof originalName === "string" ? originalName : "document");

  const db = await getDb();
  const [existing] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.storageKey, storageKey)).limit(1);
  if (existing) {
    if (existing.orderId || existing.deletedAt) {
      throw new AppError("INVALID_UPLOAD", "This upload has already been used. Please upload the file again.", 409);
    }
    return toVerified(existing);
  }

  const bytes = await readObject(storageKey);
  if (!bytes) {
    throw new AppError("UPLOAD_NOT_FOUND", "The upload didn't finish. Please try uploading the file again.", 404);
  }

  const reject = async (code: string, message: string): Promise<never> => {
    await deleteObject(storageKey).catch(() => undefined);
    throw new AppError(code, message, 422);
  };

  if (bytes.length === 0) return reject("EMPTY_FILE", "This file is empty.");
  if (bytes.length > LIMITS.maxFileBytes) {
    return reject("FILE_TOO_LARGE", `This file is larger than ${LIMITS.maxFileBytes / (1024 * 1024)} MB.`);
  }

  const format = sniffFormat(bytes);
  if (!format) {
    return reject("UNSUPPORTED_TYPE", "This file type isn't supported. Please upload a PDF, JPG or PNG.");
  }

  let pageCount = 1;
  let image: { width: number; height: number; orientation: number } | null = null;
  if (format === "JPG" || format === "PNG") {
    image = readImageMeta(bytes);
    if (!image) return reject("IMAGE_UNREADABLE", "We couldn't read this image. Please try a different file.");
    const megapixels = (image.width * image.height) / 1e6;
    const cap = format === "PNG" ? LIMITS.maxPngMegapixels : LIMITS.maxJpegMegapixels;
    if (megapixels > cap) {
      return reject("IMAGE_TOO_LARGE", `This image is too large (${Math.round(megapixels)} megapixels). Please use an image under ${cap} megapixels.`);
    }
  }
  if (format === "PDF") {
    const result = await inspectPdf(bytes);
    if (!result.ok) {
      if (result.reason === "ENCRYPTED") {
        return reject("PDF_ENCRYPTED", "This PDF is password-protected and can't be printed. Please remove the password and try again.");
      }
      if (result.reason === "EMPTY") return reject("PDF_EMPTY", "This PDF has no pages.");
      return reject("PDF_CORRUPT", "This PDF seems to be damaged and can't be opened.");
    }
    if (result.pageCount > LIMITS.maxPdfPages) {
      return reject("TOO_MANY_PAGES", `This PDF has more than ${LIMITS.maxPdfPages} pages.`);
    }
    pageCount = result.pageCount;
  }

  const [row] = await db
    .insert(uploadedFiles)
    .values({
      originalName: name,
      format,
      mimeType: MIME_BY_FORMAT[format],
      sizeBytes: bytes.length,
      storageKey,
      pageCount,
      sha256: sha256Hex(bytes),
      imageWidth: image?.width ?? null,
      imageHeight: image?.height ?? null,
      exifOrientation: image?.orientation ?? null,
    })
    .onConflictDoNothing({ target: uploadedFiles.storageKey })
    .returning();

  if (!row) {
    const [again] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.storageKey, storageKey)).limit(1);
    return toVerified(again);
  }
  return toVerified(row);
}

function toVerified(row: typeof uploadedFiles.$inferSelect): VerifiedFile {
  const shown =
    row.imageWidth && row.imageHeight ? displayedSize(row.imageWidth, row.imageHeight, row.exifOrientation) : null;
  return {
    id: row.id,
    name: row.originalName,
    format: row.format,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    imageWidth: shown?.width ?? null,
    imageHeight: shown?.height ?? null,
  };
}
