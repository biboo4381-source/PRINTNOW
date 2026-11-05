import { PDFDocument } from "pdf-lib";
import type { FileFormat } from "./config";

/** Detects the real file type from its first bytes (ignores the file name). */
export function sniffFormat(bytes: Uint8Array): FileFormat | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "PDF"; // %PDF-
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "JPG";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "PNG";
  }
  return null;
}

export const MIME_BY_FORMAT: Record<FileFormat, string> = {
  PDF: "application/pdf",
  JPG: "image/jpeg",
  PNG: "image/png",
};

export const EXT_BY_FORMAT: Record<FileFormat, string> = {
  PDF: "pdf",
  JPG: "jpg",
  PNG: "png",
};

export type PdfInspection =
  | { ok: true; pageCount: number }
  | { ok: false; reason: "ENCRYPTED" | "CORRUPT" | "EMPTY" };

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const pageCount = doc.getPageCount();
    return pageCount > 0 ? { ok: true, pageCount } : { ok: false, reason: "EMPTY" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(message)) return { ok: false, reason: "ENCRYPTED" };
    return { ok: false, reason: "CORRUPT" };
  }
}

/** Keeps a display-safe file name: no paths, no control chars, max 120 chars. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  if (!cleaned) return "document";
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - ext.length) + ext;
}
