/**
 * Reads pixel size and (for JPEG) the camera EXIF orientation from image bytes,
 * without decoding the image. Returns null if the data is not a readable PNG/JPEG.
 */
export interface ImageMeta {
  width: number;
  height: number;
  /** EXIF orientation tag 1–8 (1 = normal). PNG is always 1. */
  orientation: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];

export function readImageMeta(bytes: Uint8Array): ImageMeta | null {
  // PNG: width/height are in the IHDR chunk right after the 8-byte signature.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = u32be(bytes, 16);
    const height = u32be(bytes, 20);
    return width > 0 && height > 0 ? { width, height, orientation: 1 } : null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return readJpegMeta(bytes);
  return null;
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readJpegMeta(b: Uint8Array): ImageMeta | null {
  let i = 2;
  let orientation = 1;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan
    const len = u16be(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) break;
    const seg = i + 4;
    if (marker === 0xe1 && b[seg] === 0x45 && b[seg + 1] === 0x78 && b[seg + 2] === 0x69 && b[seg + 3] === 0x66) {
      orientation = readExifOrientation(b, seg + 6, i + 2 + len) ?? orientation;
    } else if (SOF_MARKERS.has(marker) && len >= 7) {
      const height = u16be(b, seg + 1);
      const width = u16be(b, seg + 3);
      return width > 0 && height > 0 ? { width, height, orientation } : null;
    }
    i += 2 + len;
  }
  return null;
}

function readExifOrientation(b: Uint8Array, tiff: number, end: number): number | null {
  if (tiff + 8 > end) return null;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  const big = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
  if (!little && !big) return null;
  const r16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const r32 = (o: number) =>
    little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : u32be(b, o);
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = r16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) return null;
    if (r16(entry) === 0x0112) {
      const value = r16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}
