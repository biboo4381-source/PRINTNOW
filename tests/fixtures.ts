import { readFileSync } from "node:fs";
import path from "node:path";
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

/** 160x120 JPEG with four coloured quadrants (red/green over blue/yellow). */
export const JPG_SAMPLE = Uint8Array.from(readFileSync(path.join(process.cwd(), "tests", "fixtures", "quadrants.jpg")));

export const TEXT_FILE = new TextEncoder().encode("hello, this is not a printable document");

/** A PDF whose trailer declares encryption (password-protected). */
export async function makeEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save({ useObjectStreams: false });
  const text = Buffer.from(bytes).toString("latin1").replace("trailer\n<<", "trailer\n<<\n/Encrypt 1 0 R");
  return Uint8Array.from(Buffer.from(text, "latin1"));
}
