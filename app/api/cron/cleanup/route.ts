import { handle, jsonError, noStore } from "@/lib/http";
import { runCleanup } from "@/lib/services/cleanup";

export const maxDuration = 60;

/** Called daily by Vercel Cron (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET". */
export const GET = handle(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError("UNAUTHORIZED", "Unauthorized.", 401);
  }
  return noStore(await runCleanup());
});
