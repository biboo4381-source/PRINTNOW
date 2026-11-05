import { handle, noStore } from "@/lib/http";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { completeOrder } from "@/lib/services/kiosk";

/** Kiosk step 4: printing finished → COMPLETED. Can never be printed again. */
export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const kioskId = authenticateKiosk(request);
  const { id } = await ctx.params;
  return noStore({ order: await completeOrder(kioskId, id) });
});
