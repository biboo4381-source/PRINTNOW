import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * File storage.
 * - "blob": Vercel Blob (private store). Used whenever BLOB_READ_WRITE_TOKEN is set.
 *   Browsers upload directly with a short-lived client token (see /api/uploads/token).
 * - "local": files on disk under .data/uploads. Local development and tests only
 *   (filesystem calls are marked turbopackIgnore so the deploy bundle stays small).
 *
 * Storage keys/URLs are never sent to customers; the kiosk downloads through our API.
 */
export type StorageMode = "blob" | "local";

export function storageMode(): StorageMode {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

function localRoot() {
  return process.env.LOCAL_STORAGE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "uploads");
}

function localPath(key: string) {
  const root = path.resolve(/*turbopackIgnore: true*/ localRoot());
  const full = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function readObject(key: string): Promise<Uint8Array | null> {
  if (storageMode() === "blob") {
    const { get } = await import("@vercel/blob");
    const result = await get(key, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const buf = await new Response(result.stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  try {
    return new Uint8Array(await readFile(/*turbopackIgnore: true*/ localPath(key)));
  } catch {
    return null;
  }
}

export async function objectSize(key: string): Promise<number | null> {
  if (storageMode() === "blob") {
    const { head } = await import("@vercel/blob");
    try {
      const h = await head(key);
      return h.size;
    } catch {
      return null;
    }
  }
  try {
    return (await stat(/*turbopackIgnore: true*/ localPath(key))).size;
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (storageMode() === "blob") {
    const { del } = await import("@vercel/blob");
    await del(key);
    return;
  }
  await rm(/*turbopackIgnore: true*/ localPath(key), { force: true });
}

/** Server-side write (used for generated print-ready files). */
export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (storageMode() === "blob") {
    const { put } = await import("@vercel/blob");
    await put(key, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
    return;
  }
  await writeLocalObject(key, bytes);
}

/**
 * Short-lived signed download link for a private blob (blob mode only).
 * Used for files too large to send through a Vercel Function response (4.5 MB limit).
 */
export async function signedDownloadUrl(key: string, ttlSeconds = 300): Promise<string> {
  const { issueSignedToken, presignUrl } = await import("@vercel/blob");
  const validUntil = Date.now() + ttlSeconds * 1000;
  const token = await issueSignedToken({ pathname: key, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname: key, access: "private", validUntil });
  return presignedUrl;
}

/** Local mode only: write an uploaded file to disk. */
export async function writeLocalObject(key: string, bytes: Uint8Array): Promise<void> {
  const full = localPath(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ full, bytes);
}

export function newPrintKey(): string {
  return `prints/${crypto.randomUUID()}/print.pdf`;
}

/** Accepts only keys we issued: uploads/<uuid>/<name>. */
export function isValidUploadKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.length < 300 &&
    /^uploads\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,140}$/.test(key) &&
    !key.includes("..")
  );
}
