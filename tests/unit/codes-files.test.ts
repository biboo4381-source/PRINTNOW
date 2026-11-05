import { describe, expect, it } from "vitest";
import {
  formatCollectionCode,
  generateCollectionCode,
  generateOrderRef,
  normalizeCollectionCode,
} from "@/lib/codes";
import { inspectPdf, sanitizeFileName, sniffFormat } from "@/lib/files";
import { JPG_HEADER, PNG_1PX, TEXT_FILE, makePdf } from "../fixtures";

describe("collection codes", () => {
  it("has the PN + 6 digits format", () => {
    for (let i = 0; i < 200; i++) expect(generateCollectionCode()).toMatch(/^PN\d{6}$/);
  });

  it("is not sequential or predictable (high uniqueness over many draws)", () => {
    const codes = new Set(Array.from({ length: 2000 }, generateCollectionCode));
    expect(codes.size).toBeGreaterThan(1990);
  });

  it("normalizes what people type", () => {
    expect(normalizeCollectionCode("pn 482 917")).toBe("PN482917");
    expect(normalizeCollectionCode("PN-482917")).toBe("PN482917");
    expect(normalizeCollectionCode("482917")).toBe("PN482917");
    expect(normalizeCollectionCode("PN4829")).toBeNull();
    expect(normalizeCollectionCode(123456)).toBeNull();
    expect(formatCollectionCode("PN482917")).toBe("PN 482 917");
  });

  it("generates readable order references", () => {
    expect(generateOrderRef(new Date("2026-11-05T10:00:00Z"))).toMatch(/^PNO-261105-[2-9A-HJ-NP-Z]{4}$/);
  });
});

describe("file checks", () => {
  it("detects real file types from bytes", async () => {
    expect(sniffFormat(await makePdf(1))).toBe("PDF");
    expect(sniffFormat(PNG_1PX)).toBe("PNG");
    expect(sniffFormat(JPG_HEADER)).toBe("JPG");
    expect(sniffFormat(TEXT_FILE)).toBeNull();
  });

  it("counts PDF pages", async () => {
    expect(await inspectPdf(await makePdf(7))).toEqual({ ok: true, pageCount: 7 });
  });

  it("flags damaged PDFs", async () => {
    const broken = new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf");
    expect((await inspectPdf(broken)).ok).toBe(false);
  });

  it("sanitizes file names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName('my<bad>"name".pdf')).toBe("mybadname.pdf");
    expect(sanitizeFileName("")).toBe("document");
    expect(sanitizeFileName("a".repeat(200) + ".pdf")).toHaveLength(120);
  });
});
