import { handle } from "@/lib/http";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { getFileForKiosk } from "@/lib/services/kiosk";

export const maxDuration = 60;

/** Kiosk step 3: download one original file (only while this kiosk is printing the order). */
export const GET = handle(
  async (request: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) => {
    const kioskId = authenticateKiosk(request);
    const { id, fileId } = await ctx.params;
    const { file, bytes } = await getFileForKiosk(kioskId, id, fileId);
    const asciiName = file.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        "X-File-Sha256": file.sha256,
        "Cache-Control": "no-store",
      },
    });
  },
);
