/**
 * Shared A4 layout model for image printing.
 *
 * The SAME functions drive the browser preview (canvas) and the server's print-ready PDF,
 * so what the customer sees is what the kiosk prints. All page measurements are millimetres
 * with a top-left origin (y grows downwards).
 *
 * Order of operations (applied to the image as the browser displays it, i.e. after any
 * camera EXIF orientation):
 *   1. crop     – keep a rectangle of the image (normalised 0..1 coordinates)
 *   2. rotate   – turn the cropped image clockwise by 0/90/180/270°
 *   3. place    – scale so it fits the printable area (zoom = 1 → "Fit to A4"),
 *                 multiply by zoom, centre it, then shift by offsetX/offsetY
 *   4. clip     – anything outside the printable area is not printed
 */

export const A4 = { width: 210, height: 297 } as const;
/** Unprintable border most kiosk printers need. */
export const PRINT_MARGIN_MM = 5;
export const PRINTABLE = {
  x: PRINT_MARGIN_MM,
  y: PRINT_MARGIN_MM,
  width: A4.width - 2 * PRINT_MARGIN_MM,
  height: A4.height - 2 * PRINT_MARGIN_MM,
} as const;

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 5;
export const CROP_MIN = 0.05;

export type Rotation = 0 | 90 | 180 | 270;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageAdjustment {
  rotation: Rotation;
  crop: CropRect;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };
export const DEFAULT_ADJUSTMENT: ImageAdjustment = { rotation: 0, crop: FULL_CROP, zoom: 1, offsetX: 0, offsetY: 0 };

export interface Placement {
  /** Size of the source image as displayed (px). */
  image: { width: number; height: number };
  /** Cropped region in source pixels. */
  crop: { x: number; y: number; width: number; height: number };
  rotation: Rotation;
  /** Millimetres per source pixel. */
  scale: number;
  /** Centre of the placed image on the page (mm). */
  center: { x: number; y: number };
  /** Size of the placed (cropped + rotated) image on the page (mm). */
  size: { width: number; height: number };
  /** Zoom value that makes the image fill the whole printable area. */
  fillZoom: number;
}

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Validates untrusted input (from the browser). Throws a readable Error if it can't be used. */
export function sanitizeAdjustment(input: unknown): ImageAdjustment {
  const a = (input ?? {}) as Partial<ImageAdjustment> & { crop?: Partial<CropRect> };
  if (a.rotation !== 0 && a.rotation !== 90 && a.rotation !== 180 && a.rotation !== 270) {
    throw new Error("Rotation must be 0, 90, 180 or 270 degrees.");
  }
  const c = a.crop ?? FULL_CROP;
  if (![c.x, c.y, c.w, c.h].every(isFiniteNum)) throw new Error("Invalid crop.");
  const crop = {
    x: clamp(c.x!, 0, 1 - CROP_MIN),
    y: clamp(c.y!, 0, 1 - CROP_MIN),
    w: 0,
    h: 0,
  };
  crop.w = clamp(c.w!, CROP_MIN, 1 - crop.x);
  crop.h = clamp(c.h!, CROP_MIN, 1 - crop.y);
  if (!isFiniteNum(a.zoom) || !isFiniteNum(a.offsetX) || !isFiniteNum(a.offsetY)) throw new Error("Invalid size or position.");
  return {
    rotation: a.rotation,
    crop,
    zoom: clamp(a.zoom, ZOOM_MIN, ZOOM_MAX),
    offsetX: clamp(a.offsetX, -A4.width, A4.width),
    offsetY: clamp(a.offsetY, -A4.height, A4.height),
  };
}

export function isDefaultAdjustment(a: ImageAdjustment): boolean {
  return (
    a.rotation === 0 && a.zoom === 1 && a.offsetX === 0 && a.offsetY === 0 &&
    a.crop.x === 0 && a.crop.y === 0 && a.crop.w === 1 && a.crop.h === 1
  );
}

export function computePlacement(imageWidth: number, imageHeight: number, adj: ImageAdjustment): Placement {
  const crop = {
    x: adj.crop.x * imageWidth,
    y: adj.crop.y * imageHeight,
    width: adj.crop.w * imageWidth,
    height: adj.crop.h * imageHeight,
  };
  const sideways = adj.rotation === 90 || adj.rotation === 270;
  const rw = sideways ? crop.height : crop.width;
  const rh = sideways ? crop.width : crop.height;
  const fit = Math.min(PRINTABLE.width / rw, PRINTABLE.height / rh);
  const fill = Math.max(PRINTABLE.width / rw, PRINTABLE.height / rh);
  const scale = fit * adj.zoom;
  return {
    image: { width: imageWidth, height: imageHeight },
    crop,
    rotation: adj.rotation,
    scale,
    center: {
      x: PRINTABLE.x + PRINTABLE.width / 2 + adj.offsetX,
      y: PRINTABLE.y + PRINTABLE.height / 2 + adj.offsetY,
    },
    size: { width: rw * scale, height: rh * scale },
    fillZoom: fill / fit,
  };
}

/** Rotation (clockwise) needed to display a JPEG with this EXIF orientation. Mirrored variants are approximated. */
export function exifRotation(orientation: number | null | undefined): Rotation {
  switch (orientation) {
    case 3:
    case 4:
      return 180;
    case 5:
    case 6:
      return 90;
    case 7:
    case 8:
      return 270;
    default:
      return 0;
  }
}

/** Image size as the browser displays it, given the stored pixel size and EXIF orientation. */
export function displayedSize(rawWidth: number, rawHeight: number, orientation: number | null | undefined) {
  const r = exifRotation(orientation);
  return r === 90 || r === 270 ? { width: rawHeight, height: rawWidth } : { width: rawWidth, height: rawHeight };
}

/**
 * Draws the A4 page preview onto a canvas using the shared placement.
 * `pxPerMm` is the preview scale. `image` must be the browser-decoded image (EXIF already applied).
 */
export function drawPreview(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  p: Placement,
  pxPerMm: number,
  options: { showMargins?: boolean } = {},
) {
  const k = pxPerMm;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4.width * k, A4.height * k);

  ctx.save();
  ctx.beginPath();
  ctx.rect(PRINTABLE.x * k, PRINTABLE.y * k, PRINTABLE.width * k, PRINTABLE.height * k);
  ctx.clip();
  ctx.translate(p.center.x * k, p.center.y * k);
  ctx.rotate((p.rotation * Math.PI) / 180);
  const cw = p.crop.width * p.scale * k;
  const ch = p.crop.height * p.scale * k;
  ctx.beginPath();
  ctx.rect(-cw / 2, -ch / 2, cw, ch);
  ctx.clip();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    -(p.crop.x + p.crop.width / 2) * p.scale * k,
    -(p.crop.y + p.crop.height / 2) * p.scale * k,
    p.image.width * p.scale * k,
    p.image.height * p.scale * k,
  );
  ctx.restore();

  if (options.showMargins) {
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(8,119,249,0.85)";
    ctx.strokeRect(PRINTABLE.x * k, PRINTABLE.y * k, PRINTABLE.width * k, PRINTABLE.height * k);
  }
  ctx.restore();
}
