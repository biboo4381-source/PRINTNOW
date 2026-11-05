/**
 * Pure pricing logic shared by the browser (live preview) and the server
 * (authoritative total). Money is always integer Rupiah.
 */
export type ColorMode = "BW" | "COLOR";

export interface PriceTable {
  bwPricePerPage: number;
  colorPricePerPage: number;
  currency: "IDR";
}

export interface LineInput {
  selectedPageCount: number;
  copies: number;
  colorMode: ColorMode;
}

export interface LinePrice {
  pricePerPage: number;
  printedPages: number;
  subtotal: number;
}

export function pricePerPage(prices: PriceTable, mode: ColorMode): number {
  return mode === "COLOR" ? prices.colorPricePerPage : prices.bwPricePerPage;
}

export function priceLine(prices: PriceTable, line: LineInput): LinePrice {
  if (!Number.isInteger(line.selectedPageCount) || line.selectedPageCount < 0) {
    throw new Error("selectedPageCount must be a non-negative integer");
  }
  if (!Number.isInteger(line.copies) || line.copies < 0) {
    throw new Error("copies must be a non-negative integer");
  }
  const perPage = pricePerPage(prices, line.colorMode);
  const printedPages = line.selectedPageCount * line.copies;
  return { pricePerPage: perPage, printedPages, subtotal: printedPages * perPage };
}

export function priceOrder(prices: PriceTable, lines: LineInput[]) {
  const priced = lines.map((l) => priceLine(prices, l));
  return {
    lines: priced,
    totalPrintedPages: priced.reduce((s, l) => s + l.printedPages, 0),
    total: priced.reduce((s, l) => s + l.subtotal, 0),
  };
}

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatRupiah(amount: number): string {
  return rupiah.format(amount);
}
