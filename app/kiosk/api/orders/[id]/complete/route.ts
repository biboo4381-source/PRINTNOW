import { handle, noStore } from "@/lib/http";
import { requireKiosk } from "@/lib/kiosk-session";
import { completeOrder } from "@/lib/services/kiosk";

/** Printing finished (simulated on the prototype) → COMPLETED. */
export const POST = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const kioskId = await requireKiosk();
  const { id } = await ctx.params;
  // The touchscreen kiosk prototype has no printer: every completion here is a simulated print.
  return noStore({ order: await completeOrder(kioskId, id, { simulated: true }) });
});
