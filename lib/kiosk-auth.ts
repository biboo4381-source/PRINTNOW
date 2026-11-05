import { createHmac } from "node:crypto";
import { safeEqualHex, sha256Hex } from "./codes";
import { AppError } from "./errors";

/**
 * Kiosk credentials come from the KIOSK_API_KEYS environment variable (server only):
 *   KIOSK_API_KEYS="kiosk-01:<sha256 of key>,kiosk-02:<sha256 of key>"
 * Generate entries with: npm run kiosk:key -- kiosk-01
 *
 * Two ways to authenticate:
 * 1. REST API (/api/kiosk/*): headers "Authorization: Bearer <key>" + "X-Kiosk-Id".
 * 2. Touchscreen kiosk (/kiosk): staff pair the device once with the same ID + key; the browser then
 *    holds a signed HttpOnly session cookie. The key itself never reaches the page's JavaScript.
 */
function configuredKiosks(): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (process.env.KIOSK_API_KEYS ?? "").split(/[,;\n]/)) {
    const [id, hash] = entry.trim().split(":");
    if (id && hash && /^[a-f0-9]{64}$/i.test(hash)) map.set(id.trim(), hash.trim().toLowerCase());
  }
  return map;
}

/** True if this kiosk ID + key pair is configured. */
export function verifyKioskKey(kioskId: string, key: string): boolean {
  const expected = configuredKiosks().get(kioskId);
  return !!kioskId && !!key && !!expected && safeEqualHex(expected, sha256Hex(key));
}

export function authenticateKiosk(request: Request): string {
  const kioskId = request.headers.get("x-kiosk-id")?.trim() ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!verifyKioskKey(kioskId, key)) {
    throw new AppError("UNAUTHORIZED", "Invalid kiosk credentials.", 401);
  }
  return kioskId;
}

// ─── Touchscreen kiosk session ─────────────────────────────────────────────

export const KIOSK_SESSION_COOKIE = "pn_kiosk";
export const KIOSK_SESSION_DAYS = 180;

function sessionSecret(): string {
  const secret = process.env.KIOSK_SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production" || process.env.PLAYWRIGHT_E2E === "1") {
    return "printnow-local-development-kiosk-session-secret";
  }
  throw new AppError("KIOSK_NOT_CONFIGURED", "Kiosk sessions are not configured on the server (KIOSK_SESSION_SECRET).", 500);
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", sessionSecret()).update(payload).digest("hex");

/**
 * Session token = base64url(JSON) "." HMAC. It includes a fingerprint of the kiosk's current key
 * hash, so removing or rotating the key in KIOSK_API_KEYS signs the device out automatically.
 */
export function createKioskSession(kioskId: string, now = Date.now()): string {
  const hash = configuredKiosks().get(kioskId);
  if (!hash) throw new AppError("UNAUTHORIZED", "Unknown kiosk.", 401);
  const payload = b64(JSON.stringify({ k: kioskId, f: hash.slice(0, 16), exp: now + KIOSK_SESSION_DAYS * 86_400_000 }));
  return `${payload}.${sign(payload)}`;
}

/** Returns the kiosk ID for a valid session token, otherwise null. */
export function readKioskSession(token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  try {
    if (!safeEqualHex(sign(payload), mac)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { k?: string; f?: string; exp?: number };
    if (!data.k || !data.f || !data.exp || data.exp < now) return null;
    const hash = configuredKiosks().get(data.k);
    if (!hash || !hash.startsWith(data.f)) return null;
    return data.k;
  } catch {
    return null;
  }
}
