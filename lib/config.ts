/**
 * Central business rules for PRINTNOW. Change limits here, not in components.
 * Prices are NOT here: they live in the `pricing_config` database table so they
 * can be changed without a redeploy (see lib/services/pricing.ts).
 */
export const LIMITS = {
  /** Maximum size of a single uploaded file. */
  maxFileBytes: 20 * 1024 * 1024,
  /** Each order prints exactly one document (a PDF may have many pages). */
  filesPerOrder: 1,
  /** Copies per file. */
  minCopies: 1,
  maxCopies: 50,
  /** Upper bound on pages in a single PDF we accept. */
  maxPdfPages: 500,
  /** Largest image we accept, in megapixels. PNGs are decoded when building the print file, so they get a lower cap. */
  maxJpegMegapixels: 120,
  maxPngMegapixels: 40,
} as const;

export const EXPIRY = {
  /** Unpaid orders expire after this many hours. */
  unpaidHours: 24,
  /** Paid but uncollected orders (and their codes) expire after this many days. */
  paidDays: 7,
  /** Unattached uploads and finished orders' files are deleted after this many hours. */
  fileRetentionHours: 24,
} as const;

export const KIOSK = {
  /** Wrong-code attempts allowed per kiosk within the window before a cooldown. */
  maxFailedLookups: 5,
  failedLookupWindowMinutes: 10,
} as const;

export const SUPPORTED_FORMATS = ["PDF", "JPG", "PNG"] as const;
export type FileFormat = (typeof SUPPORTED_FORMATS)[number];

export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export const SUPPORT_CONTACT = {
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@printnow.example",
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "+62 000-0000-0000",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
