"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, MonitorCog } from "lucide-react";
import { PrinterError, type PrintProgress, SimulatedPrinter } from "@/lib/kiosk/printer";
import type { KioskOrder, PrintJob } from "@/lib/kiosk/types";
import { KioskApiError, kioskApi } from "./api";

type Stage = "claim" | "prepare" | "preview" | "print" | "finish";
const STAGES: { id: Stage; label: string }[] = [
  { id: "claim", label: "Order reserved for this kiosk" },
  { id: "prepare", label: "Document retrieved and checked" },
  { id: "preview", label: "Print settings applied" },
  { id: "print", label: "Printing" },
  { id: "finish", label: "Order completed" },
];

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

export type PrintOutcome =
  | { ok: true; job: PrintJob }
  | { ok: false; kind: "rejected"; code: string } // claim refused (already processing/completed…)
  | { ok: false; kind: "failed"; retryable: boolean; reference: string };

/**
 * Runs one real order through the (simulated) printer:
 * claim (PAID → PROCESSING) → prepare (server loads + verifies the actual print file) →
 * print each sheet of the job → complete (→ COMPLETED). Failures are reported to the server.
 */
export function PrintingScreen({
  order,
  code,
  simulateJam,
  onFinished,
}: {
  order: KioskOrder;
  code: string;
  simulateJam: boolean;
  onFinished: (o: PrintOutcome) => void;
}) {
  const [stage, setStage] = useState<Stage>("claim");
  const [job, setJob] = useState<PrintJob | null>(null);
  const [progress, setProgress] = useState<PrintProgress | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const started = useRef(false);
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Mutable holder so the catch block sees the stage reached (TS can't track closure writes).
    const at: { stage: Stage } = { stage: "claim" };
    const go = (s: Stage) => {
      at.stage = s;
      setStage(s);
    };

    (async () => {
      try {
        await kioskApi.claim(order.orderId, code);
        go("prepare");
        const prepared = await kioskApi.prepare(order.orderId);
        setJob(prepared);
        go("preview");
        const bytes = await kioskApi.file(order.orderId);
        if (bytes) {
          try {
            const pdfjs = await import("pdfjs-dist");
            pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
            setDoc(await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise);
          } catch {
            /* preview is optional */
          }
        }
        go("print");
        const printer = new SimulatedPrinter({ failAtSheet: simulateJam ? Math.min(2, prepared.totalSheets) : null });
        await printer.print(prepared, setProgress);
        go("finish");
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await kioskApi.complete(order.orderId);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        if (lastErr) throw lastErr;
        finishedRef.current({ ok: true, job: prepared });
      } catch (err) {
        if (err instanceof PrinterError) {
          await kioskApi.fail(order.orderId, err.message, err.retryable).catch(() => undefined);
          finishedRef.current({ ok: false, kind: "failed", retryable: err.retryable, reference: order.orderRef });
          return;
        }
        if (at.stage === "claim" && err instanceof KioskApiError) {
          finishedRef.current({ ok: false, kind: "rejected", code: err.code });
          return;
        }
        if (at.stage === "prepare" && err instanceof KioskApiError && err.code === "PRINT_FILE_INVALID") {
          // The server already marked the order FAILED with the reason.
          finishedRef.current({ ok: false, kind: "failed", retryable: false, reference: order.orderRef });
          return;
        }
        // Anything else (network, server error): release the order so the code can be used again.
        await kioskApi.fail(order.orderId, `Kiosk error during ${at.stage}: ${err instanceof Error ? err.message : "unknown"}`, true).catch(() => undefined);
        finishedRef.current({ ok: false, kind: "failed", retryable: true, reference: order.orderRef });
      }
    })();
  }, [order, code, simulateJam]);

  const pct = progress ? Math.round((progress.sheet / progress.totalSheets) * 100) : stage === "finish" ? 100 : 0;
  const stageIndex = STAGES.findIndex((s) => s.id === stage);

  return (
    <div className="flex flex-1 flex-col gap-6 px-12 py-8" data-testid="kiosk-printing" data-stage={stage}>
      <div className="flex items-center gap-3 rounded-2xl border-2 border-warning/40 bg-warning-50 px-6 py-4 text-2xl font-bold text-warning" role="note">
        <MonitorCog className="h-8 w-8 shrink-0" aria-hidden="true" /> SIMULATED PRINTING · prototype without a printer, no paper is printed
      </div>
      <div className="grid flex-1 grid-cols-1 gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex items-center justify-center rounded-[2rem] bg-[#dfe7f1] p-6">
          <PagePreview doc={doc} page={progress?.page ?? job?.pages[0] ?? 1} colorMode={job?.colorMode ?? "COLOR"} />
        </div>
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-5xl font-extrabold">{stage === "finish" ? "Finishing…" : "Printing your document"}</h1>
            <p className="mt-2 text-2xl text-ink-muted [overflow-wrap:anywhere]">{order.files[0]?.name}</p>
          </div>
          <div>
            <div className="h-6 overflow-hidden rounded-full bg-white shadow-inner" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums" data-testid="print-progress">
              {progress
                ? `Sheet ${progress.sheet} of ${progress.totalSheets} · page ${job?.originalPages[job.pages.indexOf(progress.page)] ?? progress.page} · copy ${progress.copy} of ${progress.copies}`
                : job
                  ? `${job.totalSheets} sheet${job.totalSheets === 1 ? "" : "s"} to print`
                  : "Preparing…"}
            </p>
            {job && (
              <p className="mt-1 text-xl text-ink-muted">
                A4 · {job.colorMode === "COLOR" ? "Color" : "Black & White"} · {job.copies} cop{job.copies === 1 ? "y" : "ies"}
              </p>
            )}
          </div>
          <ol className="space-y-3">
            {STAGES.map((s, i) => {
              const done = i < stageIndex;
              const active = i === stageIndex;
              return (
                <li key={s.id} className={clsx("flex items-center gap-4 text-2xl", !done && !active && "text-ink-muted/60")}>
                  <span
                    className={clsx(
                      "flex h-11 w-11 items-center justify-center rounded-full",
                      done && "bg-green text-white",
                      active && "bg-brand text-white",
                      !done && !active && "bg-white ring-2 ring-line",
                    )}
                  >
                    {done ? <Check className="h-6 w-6" aria-hidden="true" /> : active ? <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" /> : null}
                  </span>
                  <span className={clsx(active && "font-bold")}>{s.label}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-auto text-xl text-ink-muted">Please wait. Don’t leave the kiosk until printing is complete.</p>
        </div>
      </div>
    </div>
  );
}

/** Renders the page currently being "printed" from the actual print file. */
function PagePreview({ doc, page, colorMode }: { doc: PdfDoc | null; page: number; colorMode: "BW" | "COLOR" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(0);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      try {
        const p = await doc.getPage(page);
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: 900 / base.height });
        const canvas = ref.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const r = p.render({ canvas, viewport });
        task = r;
        await r.promise;
        if (!cancelled) setRendered(page);
      } catch {
        /* superseded */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page]);

  return (
    <div className="relative flex h-full max-h-[34rem] w-full items-center justify-center">
      <canvas
        ref={ref}
        data-testid="print-preview"
        data-page={rendered}
        className={clsx("h-full max-h-[34rem] w-auto rounded bg-white shadow-[0_8px_28px_rgb(12_44_85/0.2)]", colorMode === "BW" && "grayscale", !rendered && "hidden")}
      />
      {!rendered && (
        <div className="flex aspect-[1/1.414] h-full max-h-[34rem] items-center justify-center rounded bg-white shadow">
          <LoaderCircle className="h-12 w-12 animate-spin text-line" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
