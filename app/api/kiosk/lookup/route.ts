import { handle, noStore, readJson } from "@/lib/http";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { lookupByCode } from "@/lib/services/kiosk";

/** Kiosk step 1: verify a collection code. Does not change the order. */
export const POST = handle(async (request: Request) => {
  const kioskId = authenticateKiosk(request);
  const body = await readJson(request);
  return noStore({ order: await lookupByCode(kioskId, body.code) });
});
