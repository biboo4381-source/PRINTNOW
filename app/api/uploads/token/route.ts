import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { ALLOWED_MIME_TYPES, LIMITS } from "@/lib/config";
import { handle, jsonError, noStore } from "@/lib/http";
import { storageMode } from "@/lib/storage";

/**
 * Issues short-lived client tokens so the browser can upload directly to the
 * private Vercel Blob store (bypassing the 4.5 MB function body limit).
 * The token only allows PDF/JPEG/PNG up to the size limit, under uploads/<uuid>/.
 */
export const POST = handle(async (request: Request) => {
  if (storageMode() !== "blob") {
    return jsonError("BLOB_NOT_CONFIGURED", "Blob storage is not configured; use local uploads.", 501);
  }
  const body = (await request.json()) as HandleUploadBody;
  const result = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      if (!/^uploads\/[0-9a-f-]{36}\/file\.(pdf|jpg|png)$/.test(pathname)) {
        throw new Error("Invalid upload path");
      }
      return {
        allowedContentTypes: [...ALLOWED_MIME_TYPES],
        maximumSizeInBytes: LIMITS.maxFileBytes,
        addRandomSuffix: true,
        allowOverwrite: false,
        validUntil: Date.now() + 10 * 60 * 1000,
      };
    },
  });
  return noStore(result);
});
