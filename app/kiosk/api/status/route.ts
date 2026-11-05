import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { handle, noStore } from "@/lib/http";
import { requireKiosk } from "@/lib/kiosk-session";

/** Kiosk heartbeat: confirms pairing and keeps the database warm. */
export const GET = handle(async () => {
  const kioskId = await requireKiosk();
  const db = await getDb();
  await db.execute(sql`select 1`);
  return noStore({ kioskId, online: true, time: new Date().toISOString() });
});
