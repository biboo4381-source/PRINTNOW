import { PDFDocument, StandardFonts } from "pdf-lib";

export async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595.28, 841.89]); // A4 in points
    page.drawText(`PRINTNOW test page ${i}`, { x: 72, y: 760, size: 24, font });
  }
  return doc.save();
}

/** Smallest valid 1x1 PNG. */
export const PNG_1PX = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

/** Minimal JPEG header bytes (enough for type sniffing). */
export const JPG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

export const TEXT_FILE = new TextEncoder().encode("hello, this is not a printable document");

/** A PDF whose trailer declares encryption (password-protected). */
export async function makeEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save({ useObjectStreams: false });
  const text = Buffer.from(bytes).toString("latin1").replace("trailer\n<<", "trailer\n<<\n/Encrypt 1 0 R");
  return Uint8Array.from(Buffer.from(text, "latin1"));
}
