import { describe, expect, it } from "vitest";
import { formatRupiah, priceLine, priceOrder } from "@/lib/pricing";

const prices = { bwPricePerPage: 500, colorPricePerPage: 1500, currency: "IDR" as const };

describe("pricing", () => {
  it("prices black & white pages", () => {
    expect(priceLine(prices, { selectedPageCount: 10, copies: 1, colorMode: "BW" })).toEqual({
      pricePerPage: 500,
      printedPages: 10,
      subtotal: 5000,
    });
  });

  it("prices color pages and multiplies by copies", () => {
    expect(priceLine(prices, { selectedPageCount: 3, copies: 4, colorMode: "COLOR" })).toEqual({
      pricePerPage: 1500,
      printedPages: 12,
      subtotal: 18000,
    });
  });

  it("sums multiple files with different settings", () => {
    const result = priceOrder(prices, [
      { selectedPageCount: 10, copies: 2, colorMode: "BW" }, // 20 * 500 = 10000
      { selectedPageCount: 1, copies: 3, colorMode: "COLOR" }, // 3 * 1500 = 4500
    ]);
    expect(result.total).toBe(14500);
    expect(result.totalPrintedPages).toBe(23);
  });

  it("rejects invalid input", () => {
    expect(() => priceLine(prices, { selectedPageCount: -1, copies: 1, colorMode: "BW" })).toThrow();
    expect(() => priceLine(prices, { selectedPageCount: 1, copies: 1.5, colorMode: "BW" })).toThrow();
  });

  it("formats Rupiah", () => {
    expect(formatRupiah(14500).replace(/\s/g, " ")).toMatch(/Rp.?14\.500/);
  });
});
