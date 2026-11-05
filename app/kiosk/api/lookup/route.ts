import { handle, noStore, readJson } from "@/lib/http";
import { requireKiosk } from "@/lib/kiosk-session";
import { lookupByCode } from "@/lib/services/kiosk";

/** Verify a collection code (no state change). */
export const POST = handle(async (request: Request) => {
  const kioskId = await requireKiosk();
  const body = await readJson(request);
  return noStore({ order: await lookupByCode(kioskId, body.code) });
});
