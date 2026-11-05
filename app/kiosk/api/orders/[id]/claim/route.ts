import { handle, noStore, readJson } from "@/lib/http";
import { requireKiosk } from "@/lib/kiosk-session";
import { claimOrder } from "@/lib/services/kiosk";

/** Customer tapped CONFIRM & PRINT: atomically PAID → PROCESSING. */
export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const kioskId = await requireKiosk();
  const { id } = await ctx.params;
  const body = await readJson(request);
  return noStore({ order: await claimOrder(kioskId, id, body.code) });
});
