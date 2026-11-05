import { sql } from "drizzle-orm";
import { databaseMode, getDb } from "@/lib/db";
import { noStore } from "@/lib/http";
import { storageMode } from "@/lib/storage";

/** Basic health check for monitoring and the kiosk team. Exposes no secrets. */
export async function GET() {
  let database = "ok";
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
  } catch {
    database = "unavailable";
  }
  return noStore(
    { status: database === "ok" ? "ok" : "degraded", database, databaseMode: databaseMode(), storage: storageMode() },
    { status: database === "ok" ? 200 : 503 },
  );
}
