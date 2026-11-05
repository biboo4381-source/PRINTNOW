/**
 * Applies SQL migrations in /drizzle to the Postgres database in DATABASE_URL.
 * Runs automatically before `next build` on Vercel. Skipped when no real DATABASE_URL is set
 * (local dev uses PGlite, which migrates itself on first use).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { normalizePostgresUrl } from "../lib/db/url";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url || url.startsWith("pglite:")) {
    console.log("[migrate] No Postgres DATABASE_URL set; skipping (local PGlite migrates on first use).");
    return;
  }
  const pool = new Pool({ connectionString: normalizePostgresUrl(url), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    console.log("[migrate] Database is up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
});
