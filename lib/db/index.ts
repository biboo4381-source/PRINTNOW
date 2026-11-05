import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { normalizePostgresUrl } from "./url";

/**
 * Database connection.
 * - Production / preview (Vercel): DATABASE_URL points at Neon Postgres → node-postgres pool.
 * - Local dev and tests: no DATABASE_URL (or "pglite:...") → embedded PGlite Postgres,
 *   migrated automatically. "pglite:memory" keeps it in RAM (tests).
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type GlobalWithDb = typeof globalThis & { __printnowDb?: Promise<Db> };
const g = globalThis as GlobalWithDb;

export function databaseMode(): "postgres" | "pglite" {
  const url = process.env.DATABASE_URL ?? "";
  return url && !url.startsWith("pglite:") ? "postgres" : "pglite";
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL ?? "";
  if (databaseMode() === "postgres") {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: normalizePostgresUrl(url), max: 5, idleTimeoutMillis: 10_000 });
    return drizzle(pool, { schema }) as unknown as Db;
  }

  if (process.env.VERCEL === "1") {
    throw new Error(
      "DATABASE_URL is not configured. Connect a Neon Postgres database to this Vercel project (see docs/DEPLOYMENT.md).",
    );
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const target = url.replace(/^pglite:/, "");
  const dataDir = target === "memory" ? undefined : target || path.join(process.cwd(), ".data", "pglite");
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!g.__printnowDb) {
    g.__printnowDb = connect().catch((err) => {
      g.__printnowDb = undefined;
      throw err;
    });
  }
  return g.__printnowDb;
}

export { schema };
