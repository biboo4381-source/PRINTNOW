/**
 * Neon connection strings use sslmode=require. node-postgres currently treats that as
 * verify-full (full certificate checks) but warns that v9 will weaken it to libpq semantics.
 * Pin the strict behaviour explicitly so it stays secure and the warning goes away.
 */
export function normalizePostgresUrl(url: string): string {
  try {
    const u = new URL(url);
    const mode = u.searchParams.get("sslmode");
    if (mode === "require" || mode === "prefer" || mode === "verify-ca") u.searchParams.set("sslmode", "verify-full");
    return u.toString();
  } catch {
    return url;
  }
}
