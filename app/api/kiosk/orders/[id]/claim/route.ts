import { handle, noStore, readJson } from "@/lib/http";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { claimOrder } from "@/lib/services/kiosk";

/** Kiosk step 2: atomically move PAID → PROCESSING. Returns files + print settings. */
export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const kioskId = authenticateKiosk(request);
  const { id } = await ctx.params;
  const body = await readJson(request);
  return noStore({ order: await claimOrder(kioskId, id, body.code) });
});
