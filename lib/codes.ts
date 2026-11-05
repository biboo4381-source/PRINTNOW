import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Collection code: "PN" + 6 cryptographically random digits, e.g. PN482917. */
export function generateCollectionCode(): string {
  return `PN${randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
}

/** Accepts "pn 482 917", "PN-482917", "482917" → "PN482917"; null if malformed. */
export function normalizeCollectionCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.toUpperCase().replace(/[\s\-_.]/g, "");
  const digits = cleaned.startsWith("PN") ? cleaned.slice(2) : cleaned;
  return /^\d{6}$/.test(digits) ? `PN${digits}` : null;
}

/** "PN482917" → "PN 482 917" for display. */
export function formatCollectionCode(code: string): string {
  return `${code.slice(0, 2)} ${code.slice(2, 5)} ${code.slice(5)}`;
}

const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

/** Human-friendly order reference, e.g. PNO-261105-7KQ2 (not secret). */
export function generateOrderRef(now = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += REF_ALPHABET[randomInt(0, REF_ALPHABET.length)];
  return `PNO-${yy}${mm}${dd}-${suffix}`;
}

/** 128-bit random secret, URL-safe. */
export function generateSecretToken(): string {
  return randomBytes(16).toString("base64url");
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}
