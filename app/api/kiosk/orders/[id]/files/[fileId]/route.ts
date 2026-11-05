import { handle, jsonError } from "@/lib/http";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { getFileForKiosk } from "@/lib/services/kiosk";
import { objectSize, readObject, signedDownloadUrl, storageMode } from "@/lib/storage";

export const maxDuration = 60;

/** Vercel Functions can't return more than 4.5 MB, so bigger files go through a signed link. */
const DIRECT_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * Kiosk step 3: download the print-ready file (default) or the original upload (?variant=original).
 * Only while this kiosk is printing the order. Large files answer with a 302 redirect to a
 * 5-minute signed link: use a client that follows redirects (curl -L).
 */
export const GET = handle(async (request: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) => {
  const kioskId = authenticateKiosk(request);
  const { id, fileId } = await ctx.params;
  const variant = new URL(request.url).searchParams.get("variant") === "original" ? "original" : "print";
  const file = await getFileForKiosk(kioskId, id, fileId, variant);
  const headers: Record<string, string> = {
    "X-File-Sha256": file.sha256,
    "X-File-Variant": file.variant,
    "Cache-Control": "no-store",
  };

  if (storageMode() === "blob") {
    const size = await objectSize(file.storageKey);
    if (size === null) return jsonError("FILE_NOT_FOUND", "The file is missing from storage.", 404);
    if (size > DIRECT_LIMIT_BYTES) {
      const url = await signedDownloadUrl(file.storageKey, 300);
      return new Response(null, { status: 302, headers: { ...headers, Location: url } });
    }
  }

  const bytes = await readObject(file.storageKey);
  if (!bytes) return jsonError("FILE_NOT_FOUND", "The file is missing from storage.", 404);
  const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new Response(Buffer.from(bytes), {
    headers: {
      ...headers,
      "Content-Type": file.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    },
  });
});
