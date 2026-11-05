import { safeEqualHex, sha256Hex } from "./codes";
import { AppError } from "./errors";

/**
 * Kiosk credentials come from the KIOSK_API_KEYS environment variable (server only):
 *   KIOSK_API_KEYS="kiosk-01:<sha256 of key>,kiosk-02:<sha256 of key>"
 * Generate entries with: npm run kiosk:key -- kiosk-01
 * The kiosk sends:  Authorization: Bearer <key>   and   X-Kiosk-Id: kiosk-01
 */
function configuredKiosks(): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (process.env.KIOSK_API_KEYS ?? "").split(/[,;\n]/)) {
    const [id, hash] = entry.trim().split(":");
    if (id && hash && /^[a-f0-9]{64}$/i.test(hash)) map.set(id.trim(), hash.trim().toLowerCase());
  }
  return map;
}

export function authenticateKiosk(request: Request): string {
  const kioskId = request.headers.get("x-kiosk-id")?.trim() ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const expected = configuredKiosks().get(kioskId);
  if (!kioskId || !key || !expected || !safeEqualHex(expected, sha256Hex(key))) {
    throw new AppError("UNAUTHORIZED", "Invalid kiosk credentials.", 401);
  }
  return kioskId;
}
