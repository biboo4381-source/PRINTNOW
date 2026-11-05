import { handle, noStore } from "@/lib/http";
import { requireKiosk } from "@/lib/kiosk-session";
import { prepareJob } from "@/lib/services/kiosk";

export const maxDuration = 60;

/** Retrieve and verify the actual print-ready document; returns the print job. */
export const POST = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const kioskId = await requireKiosk();
  const { id } = await ctx.params;
  return noStore({ job: await prepareJob(kioskId, id) });
});
