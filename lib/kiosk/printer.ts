import type { PrintJob } from "./types";

/**
 * Printer abstraction for the kiosk. The prototype (iPad, no printer) uses SimulatedPrinter.
 * A real printer later becomes another PrinterDriver (e.g. a print service on a PC next to the
 * printer, or a cloud-print API); the kiosk screens don't change.
 */
export interface PrintProgress {
  /** 1-based sheet being printed. */
  sheet: number;
  totalSheets: number;
  /** Page of the print file on this sheet. */
  page: number;
  /** 1-based copy number. */
  copy: number;
  copies: number;
}

export interface PrintResult {
  sheetsPrinted: number;
  simulated: boolean;
}

export class PrinterError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "PrinterError";
  }
}

export interface PrinterDriver {
  readonly kind: "simulated" | "real";
  readonly label: string;
  print(job: PrintJob, onProgress: (p: PrintProgress) => void): Promise<PrintResult>;
}

/** Collated sheet order: copy 1 → all pages, copy 2 → all pages, … */
export function sheetSequence(job: Pick<PrintJob, "pages" | "copies">): { page: number; copy: number }[] {
  const out: { page: number; copy: number }[] = [];
  for (let copy = 1; copy <= job.copies; copy++) for (const page of job.pages) out.push({ page, copy });
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SimulatedPrinter implements PrinterDriver {
  readonly kind = "simulated" as const;
  readonly label = "Simulated printer (prototype, no paper output)";

  constructor(private readonly options: { msPerSheet?: number; maxTotalMs?: number; failAtSheet?: number | null } = {}) {}

  async print(job: PrintJob, onProgress: (p: PrintProgress) => void): Promise<PrintResult> {
    const sheets = sheetSequence(job);
    if (sheets.length !== job.totalSheets) {
      throw new PrinterError("Print job is inconsistent (sheet count).", false);
    }
    const perSheet = Math.max(120, Math.min(this.options.msPerSheet ?? 700, (this.options.maxTotalMs ?? 30_000) / Math.max(1, sheets.length)));
    for (let i = 0; i < sheets.length; i++) {
      const { page, copy } = sheets[i];
      onProgress({ sheet: i + 1, totalSheets: sheets.length, page, copy, copies: job.copies });
      await wait(perSheet);
      if (this.options.failAtSheet && i + 1 >= this.options.failAtSheet) {
        throw new PrinterError("Simulated paper jam", true);
      }
    }
    return { sheetsPrinted: sheets.length, simulated: true };
  }
}
