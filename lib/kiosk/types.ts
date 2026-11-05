/** Shapes shared by the kiosk UI (browser) and the kiosk services (server). No server imports here. */

export interface PrintJob {
  orderId: string;
  orderRef: string;
  fileId: string;
  fileName: string;
  originalFormat: "PDF" | "JPG" | "PNG";
  paperSize: "A4";
  colorMode: "BW" | "COLOR";
  copies: number;
  /** Pages of the print file to print, in order (1-based). */
  pages: number[];
  /** The same pages numbered as in the customer's original document (for display). */
  originalPages: number[];
  /** Pages in the print file. */
  printFilePageCount: number;
  /** pages × copies, collated. */
  totalSheets: number;
  sha256: string;
  sizeBytes: number;
}

export interface KioskOrder {
  orderId: string;
  orderRef: string;
  status: string;
  totalPrice: number;
  paidAt: string | null;
  expiresAt: string;
  totalPrintedPages: number;
  files: {
    fileId: string;
    name: string;
    format: "PDF" | "JPG" | "PNG";
    pageCount: number;
    settings: {
      paperSize: "A4";
      colorMode: "BW" | "COLOR";
      copies: number;
      pages: string;
      selectedPageCount: number;
      printedPages: number;
      imageAdjustment: unknown;
    };
  }[];
}
