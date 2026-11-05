import { describe, expect, it } from "vitest";
import {
  formatCollectionCode,
  generateCollectionCode,
  generateOrderRef,
  normalizeCollectionCode,
} from "@/lib/codes";
import { inspectPdf, sanitizeFileName, sniffFormat } from "@/lib/files";
import { JPG_SAMPLE, PNG_1PX, TEXT_FILE, makePdf } from "../fixtures";

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
    expect(sniffFormat(JPG_SAMPLE)).toBe("JPG");
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

describe("postgres url", async () => {
  const { normalizePostgresUrl } = await import("@/lib/db/url");
  it("pins sslmode=require to verify-full and leaves others alone", () => {
    expect(normalizePostgresUrl("postgresql://u:p@h.neon.tech/db?sslmode=require")).toBe("postgresql://u:p@h.neon.tech/db?sslmode=verify-full");
    expect(normalizePostgresUrl("postgresql://u:p@localhost/db")).toBe("postgresql://u:p@localhost/db");
  });
});

describe("kiosk printer simulation", async () => {
  const { SimulatedPrinter, PrinterError, sheetSequence } = await import("@/lib/kiosk/printer");
  const job = {
    orderId: "o", orderRef: "PNO", fileId: "f", fileName: "a.pdf", originalFormat: "PDF" as const, paperSize: "A4" as const,
    colorMode: "BW" as const, copies: 2, pages: [1, 3], originalPages: [1, 3], printFilePageCount: 3, totalSheets: 4, sha256: "", sizeBytes: 1,
  };

  it("prints collated sheets: copy 1 (pages 1,3) then copy 2", async () => {
    expect(sheetSequence(job)).toEqual([{ page: 1, copy: 1 }, { page: 3, copy: 1 }, { page: 1, copy: 2 }, { page: 3, copy: 2 }]);
    const seen: number[] = [];
    const res = await new SimulatedPrinter({ msPerSheet: 1, maxTotalMs: 4 }).print(job, (p) => seen.push(p.sheet));
    expect(res).toEqual({ sheetsPrinted: 4, simulated: true });
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("can simulate a paper jam (retryable) and rejects inconsistent jobs", async () => {
    await expect(new SimulatedPrinter({ msPerSheet: 1, maxTotalMs: 4, failAtSheet: 2 }).print(job, () => {})).rejects.toBeInstanceOf(PrinterError);
    await expect(new SimulatedPrinter({ msPerSheet: 1 }).print({ ...job, totalSheets: 9 }, () => {})).rejects.toThrow(/inconsistent/);
  });
});
