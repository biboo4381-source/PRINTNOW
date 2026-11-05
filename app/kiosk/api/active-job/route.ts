import { handle, noStore } from "@/lib/http";
import { requireKiosk } from "@/lib/kiosk-session";
import { getActiveJobForKiosk } from "@/lib/services/kiosk";

/** An order this kiosk claimed but never finished (e.g. the iPad was closed mid-print). */
export const GET = handle(async () => {
  const kioskId = await requireKiosk();
  return noStore({ order: await getActiveJobForKiosk(kioskId) });
});
