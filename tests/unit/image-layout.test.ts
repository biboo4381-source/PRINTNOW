import { describe, expect, it } from "vitest";
import {
  A4,
  DEFAULT_ADJUSTMENT,
  PRINTABLE,
  computePlacement,
  displayedSize,
  exifRotation,
  sanitizeAdjustment,
} from "@/lib/image-layout";
import { readImageMeta } from "@/lib/image-meta";
import { quadrantPng } from "../png";

describe("A4 placement", () => {
  it("fits a landscape image to the printable width by default, centred", () => {
    const p = computePlacement(400, 300, DEFAULT_ADJUSTMENT);
    expect(p.size.width).toBeCloseTo(PRINTABLE.width);
    expect(p.size.height).toBeCloseTo(PRINTABLE.width * 0.75);
    expect(p.center).toEqual({ x: A4.width / 2, y: A4.height / 2 });
  });

  it("rotating 90° turns a landscape photo portrait and keeps proportions", () => {
    const p = computePlacement(400, 300, { ...DEFAULT_ADJUSTMENT, rotation: 90 });
    expect(p.size.width / p.size.height).toBeCloseTo(300 / 400);
    // portrait 3:4 limited by width: 200mm wide → 266.7mm tall, fits in 287mm
    expect(p.size.width).toBeCloseTo(PRINTABLE.width);
  });

  it("fill zoom covers the whole printable area without distortion", () => {
    const base = computePlacement(400, 300, DEFAULT_ADJUSTMENT);
    const filled = computePlacement(400, 300, { ...DEFAULT_ADJUSTMENT, zoom: base.fillZoom });
    expect(filled.size.height).toBeCloseTo(PRINTABLE.height);
    expect(filled.size.width).toBeGreaterThanOrEqual(PRINTABLE.width);
    expect(filled.size.width / filled.size.height).toBeCloseTo(4 / 3);
  });

  it("crop changes the shape that is placed", () => {
    const p = computePlacement(400, 300, { ...DEFAULT_ADJUSTMENT, crop: { x: 0, y: 0, w: 0.5, h: 1 } });
    expect(p.crop).toEqual({ x: 0, y: 0, width: 200, height: 300 });
    expect(p.size.width / p.size.height).toBeCloseTo(200 / 300);
  });

  it("zoom and offset move and scale the image", () => {
    const p = computePlacement(400, 300, { ...DEFAULT_ADJUSTMENT, zoom: 0.5, offsetX: 10, offsetY: -20 });
    expect(p.size.width).toBeCloseTo(PRINTABLE.width / 2);
    expect(p.center).toEqual({ x: A4.width / 2 + 10, y: A4.height / 2 - 20 });
  });
});

describe("sanitizeAdjustment", () => {
  it("accepts valid input and clamps out-of-range values", () => {
    const a = sanitizeAdjustment({ rotation: 270, crop: { x: -1, y: 0.5, w: 2, h: 0.9 }, zoom: 99, offsetX: 1e6, offsetY: 3 });
    expect(a).toEqual({ rotation: 270, crop: { x: 0, y: 0.5, w: 1, h: 0.5 }, zoom: 5, offsetX: A4.width, offsetY: 3 });
  });

  it.each([
    [{ ...DEFAULT_ADJUSTMENT, rotation: 45 }],
    [{ ...DEFAULT_ADJUSTMENT, zoom: "big" }],
    [{ ...DEFAULT_ADJUSTMENT, crop: { x: 0, y: 0, w: NaN, h: 1 } }],
    [null],
  ])("rejects %j", (input) => {
    expect(() => sanitizeAdjustment(input)).toThrow();
  });
});

describe("image metadata", () => {
  it("reads PNG size", () => {
    expect(readImageMeta(quadrantPng(400, 300))).toEqual({ width: 400, height: 300, orientation: 1 });
  });

  it("reads JPEG size and EXIF orientation", () => {
    const exif = [
      0x45, 0x78, 0x69, 0x66, 0, 0, // "Exif\0\0"
      0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, // TIFF big-endian, IFD0 at 8
      0, 1, // 1 entry
      0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, // Orientation = 6
      0, 0, 0, 0,
    ];
    const app1 = [0xff, 0xe1, 0, exif.length + 2, ...exif];
    const sof = [0xff, 0xc0, 0, 17, 8, 0x0b, 0xb8, 0x0f, 0xa0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
    const jpg = Uint8Array.from([0xff, 0xd8, ...app1, ...sof, 0xff, 0xd9]);
    expect(readImageMeta(jpg)).toEqual({ width: 4000, height: 3000, orientation: 6 });
    expect(displayedSize(4000, 3000, 6)).toEqual({ width: 3000, height: 4000 });
    expect(exifRotation(6)).toBe(90);
    expect(exifRotation(8)).toBe(270);
    expect(exifRotation(1)).toBe(0);
  });

  it("returns null for non-images", () => {
    expect(readImageMeta(new TextEncoder().encode("hello"))).toBeNull();
  });
});
