import { handle, noStore, readJson } from "@/lib/http";
import { requireKiosk } from "@/lib/kiosk-session";
import { failOrder } from "@/lib/services/kiosk";

/** Printing failed. retryable → back to PAID (same code works again); otherwise FAILED. */
export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const kioskId = await requireKiosk();
  const { id } = await ctx.params;
  const body = await readJson(request);
  return noStore({ order: await failOrder(kioskId, id, body.reason, body.retryable, { simulated: true }) });
});
