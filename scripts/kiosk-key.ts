/**
 * Generates a kiosk API key.
 *   npm run kiosk:key -- kiosk-01
 * Give the KEY to the kiosk device. Put the ENV ENTRY into KIOSK_API_KEYS on Vercel
 * (comma-separate multiple kiosks). The server only ever stores the hash.
 */
import { createHash, randomBytes } from "node:crypto";

const kioskId = process.argv[2];
if (!kioskId || !/^[a-zA-Z0-9_-]{2,40}$/.test(kioskId)) {
  console.error("Usage: npm run kiosk:key -- <kiosk-id>   (letters, digits, - and _)");
  process.exit(1);
}
const key = `pnk_${randomBytes(24).toString("base64url")}`;
const hash = createHash("sha256").update(key).digest("hex");
console.log(`Kiosk ID : ${kioskId}`);
console.log(`API key  : ${key}   <- give to the kiosk (keep secret)`);
console.log(`ENV entry: ${kioskId}:${hash}   <- add to KIOSK_API_KEYS`);
