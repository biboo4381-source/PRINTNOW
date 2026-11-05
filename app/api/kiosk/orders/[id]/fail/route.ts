import { handle, noStore, readJson } from "@/lib/http";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { failOrder } from "@/lib/services/kiosk";

/** Kiosk step 4 (error): retryable → back to PAID; otherwise → FAILED. */
export const POST = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const kioskId = authenticateKiosk(request);
  const { id } = await ctx.params;
  const body = await readJson(request);
  return noStore({ order: await failOrder(kioskId, id, body.reason, body.retryable) });
});
