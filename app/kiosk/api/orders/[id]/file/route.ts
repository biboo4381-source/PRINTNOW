import { handle, jsonError } from "@/lib/http";
import { requireKiosk } from "@/lib/kiosk-session";
import { loadOrderRows } from "@/lib/services/orders";
import { getFileForKiosk } from "@/lib/services/kiosk";
import { getDb } from "@/lib/db";
import { objectSize, readObject, signedDownloadUrl, storageMode } from "@/lib/storage";

export const maxDuration = 60;
const DIRECT_LIMIT_BYTES = 4 * 1024 * 1024;

/** The print-ready PDF for the on-screen preview. Only while this kiosk is printing the order. */
export const GET = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const kioskId = await requireKiosk();
  const { id } = await ctx.params;
  const [row] = await loadOrderRows(await getDb(), id);
  if (!row) return jsonError("FILE_NOT_FOUND", "File not found.", 404);
  const file = await getFileForKiosk(kioskId, id, row.f.id, "print");
  if (storageMode() === "blob") {
    const size = await objectSize(file.storageKey);
    if (size !== null && size > DIRECT_LIMIT_BYTES) {
      return new Response(null, { status: 302, headers: { Location: await signedDownloadUrl(file.storageKey, 300), "Cache-Control": "no-store" } });
    }
  }
  const bytes = await readObject(file.storageKey);
  if (!bytes) return jsonError("FILE_NOT_FOUND", "The file is missing from storage.", 404);
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": file.mimeType, "Content-Length": String(bytes.length), "Cache-Control": "no-store" },
  });
});
