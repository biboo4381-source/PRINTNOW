import {
  PDFDocument,
  clip,
  concatTransformationMatrix,
  drawObject,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rotateDegrees,
  translate,
} from "pdf-lib";
import { A4, type ImageAdjustment, PRINTABLE, computePlacement, displayedSize, exifRotation } from "./image-layout";

const PT_PER_MM = 72 / 25.4;

/**
 * Builds the print-ready, single-page A4 PDF for an adjusted JPG/PNG.
 * Uses the original image at full resolution and the shared placement from image-layout.ts,
 * so it matches the customer's preview.
 */
export async function renderImagePrintPdf(input: {
  bytes: Uint8Array;
  format: "JPG" | "PNG";
  rawWidth: number;
  rawHeight: number;
  exifOrientation: number;
  adjustment: ImageAdjustment;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("PRINTNOW print");
  doc.setProducer("PRINTNOW");
  const page = doc.addPage([A4.width * PT_PER_MM, A4.height * PT_PER_MM]);
  const image = input.format === "JPG" ? await doc.embedJpg(input.bytes) : await doc.embedPng(input.bytes);
  const name = page.node.newXObject("PNImage", image.ref);

  const shown = displayedSize(input.rawWidth, input.rawHeight, input.exifOrientation);
  const p = computePlacement(shown.width, shown.height, input.adjustment);
  const k = PT_PER_MM;
  const pageH = A4.height;

  // Everything below mirrors drawPreview(): clip → move → rotate → crop window → image.
  const s = p.scale * k; // points per source pixel
  const cw = p.crop.width * s;
  const ch = p.crop.height * s;
  const boxW = p.image.width * s;
  const boxH = p.image.height * s;
  const left = -(p.crop.x + p.crop.width / 2) * s;
  const top = (p.crop.y + p.crop.height / 2) * s;
  const bottom = top - boxH;

  const exif = exifRotation(input.exifOrientation);
  const rawW = exif === 90 || exif === 270 ? boxH : boxW;
  const rawH = exif === 90 || exif === 270 ? boxW : boxH;

  page.pushOperators(
    pushGraphicsState(),
    // 1. printable area
    rectangle(PRINTABLE.x * k, (pageH - PRINTABLE.y - PRINTABLE.height) * k, PRINTABLE.width * k, PRINTABLE.height * k),
    clip(),
    endPath(),
    // 2–3. move to the image centre and rotate clockwise (PDF y-axis points up, so negate)
    translate(p.center.x * k, (pageH - p.center.y) * k),
    rotateDegrees(-p.rotation),
    // 4. crop window
    rectangle(-cw / 2, -ch / 2, cw, ch),
    clip(),
    endPath(),
    // 5. the image as displayed (undo the camera EXIF orientation of the stored pixels)
    translate(left + boxW / 2, bottom + boxH / 2),
    rotateDegrees(-exif),
    concatTransformationMatrix(rawW, 0, 0, rawH, -rawW / 2, -rawH / 2),
    drawObject(name),
    popGraphicsState(),
  );

  return doc.save();
}

/** New PDF containing only the selected pages (1-based), page content unchanged. */
export async function extractPdfPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { updateMetadata: false });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  copied.forEach((pg) => out.addPage(pg));
  out.setProducer("PRINTNOW");
  return out.save();
}
