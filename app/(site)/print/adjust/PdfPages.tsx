"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, X, ZoomIn } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { compressPages, parsePageSelection } from "@/lib/pages";
import { usePrintFlow } from "../PrintFlowProvider";

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;
const BATCH = 24;

/** Preview of every page with tap-to-select, plus the text range box. PDF content is never changed. */
export function PdfPages() {
  const flow = usePrintFlow();
  const file = flow.file!;
  const pageCount = file.pageCount ?? 1;
  const { settings, updateSettings, getSource } = flow;
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [shown, setShown] = useState(Math.min(BATCH, pageCount));
  const [zoomPage, setZoomPage] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      const blob = await getSource();
      if (!blob) return !cancelled && setStatus("missing");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const loading = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        task = loading;
        const loaded = await loading.promise;
        if (cancelled) return;
        setDoc(loaded);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("missing");
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [getSource, file.fileId]);

  const custom = settings.pageMode === "custom";
  const parsed = custom ? parsePageSelection(settings.customPages, pageCount) : parsePageSelection("all", pageCount);
  const selected = new Set(parsed.ok ? parsed.pages : []);

  function toggle(page: number) {
    const next = new Set(selected);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    updateSettings({ pageMode: "custom", customPages: compressPages([...next].sort((a, b) => a - b)) });
  }

  return (
    <div>
      <fieldset>
        <legend className="mb-2 font-semibold">Which pages do you want to print?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "all", label: `All pages (${pageCount})` },
              { value: "custom", label: "Choose pages" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={clsx(
                "flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border-2 px-3 text-center font-bold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-100",
                settings.pageMode === opt.value ? "border-brand bg-brand-50" : "border-line bg-white hover:border-brand/50",
              )}
            >
              <input
                type="radio"
                name="page-mode"
                value={opt.value}
                checked={settings.pageMode === opt.value}
                onChange={() =>
                  updateSettings(
                    opt.value === "custom" && !settings.customPages
                      ? { pageMode: "custom", customPages: pageCount > 1 ? `1-${pageCount}` : "1" }
                      : { pageMode: opt.value },
                  )
                }
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {custom && (
        <div className="mt-3">
          <label htmlFor="page-range" className="text-sm font-medium text-ink-muted">
            Tap pages below, or type them, for example <span className="font-mono">1-3, 5</span>
          </label>
          <input
            id="page-range"
            type="text"
            autoComplete="off"
            value={settings.customPages}
            onChange={(e) => updateSettings({ customPages: e.target.value })}
            aria-invalid={!parsed.ok}
            aria-describedby="page-range-status"
            className={clsx(
              "mt-1 h-14 w-full rounded-2xl border-2 bg-white px-4 font-mono text-lg focus:outline-none",
              parsed.ok ? "border-line focus:border-brand" : "border-danger",
            )}
          />
        </div>
      )}
      <p id="page-range-status" className={clsx("mt-2 text-sm font-medium", parsed.ok ? "text-ink-muted" : "text-danger")} role={parsed.ok ? "status" : "alert"}>
        {parsed.ok ? `${parsed.count} of ${pageCount} page${pageCount === 1 ? "" : "s"} selected` : parsed.error}
      </p>

      <div className="mt-4">
        {status === "loading" && (
          <p className="flex items-center gap-2 text-ink-muted">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading preview…
          </p>
        )}
        {status === "missing" && (
          <Alert tone="info" title="Page preview not available">
            We can’t show the pages in this browser, but you can still choose pages by number.
          </Alert>
        )}
        {doc && (
          <>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" aria-label="Pages">
              {Array.from({ length: shown }, (_, i) => i + 1).map((n) => (
                <li key={n}>
                  <PageThumb
                    doc={doc}
                    page={n}
                    selected={selected.has(n)}
                    selectable={custom}
                    onToggle={() => toggle(n)}
                    onZoom={() => setZoomPage(n)}
                  />
                </li>
              ))}
            </ul>
            {shown < pageCount && (
              <Button variant="secondary" className="mt-4 w-full" onClick={() => setShown((s) => Math.min(pageCount, s + BATCH))}>
                Show more pages ({pageCount - shown} more)
              </Button>
            )}
          </>
        )}
      </div>

      {doc && zoomPage && <PageZoom doc={doc} page={zoomPage} pageCount={pageCount} onClose={() => setZoomPage(null)} onChange={setZoomPage} />}
    </div>
  );
}

function useRenderPage(doc: PdfDoc, page: number, cssWidth: number, visible: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!visible || !cssWidth) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      try {
        const p = await doc.getPage(page);
        const base = p.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale: (cssWidth * dpr) / base.width });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const render = p.render({ canvas, viewport });
        task = render;
        await render.promise;
        if (!cancelled) setDone(true);
      } catch {
        /* cancelled or unrenderable page */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, cssWidth, visible]);
  return { canvasRef, done };
}

function PageThumb({
  doc,
  page,
  selected,
  selectable,
  onToggle,
  onZoom,
}: {
  doc: PdfDoc;
  page: number;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  onZoom: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const { canvasRef, done } = useRenderPage(doc, page, 160, visible);

  return (
    <div ref={boxRef} className="relative" data-testid="pdf-page" data-page={page} data-selected={selected}>
      <button
        type="button"
        onClick={selectable ? onToggle : onZoom}
        aria-pressed={selectable ? selected : undefined}
        aria-label={selectable ? `Page ${page}${selected ? ", selected" : ""}` : `Preview page ${page}`}
        className={clsx(
          "block w-full overflow-hidden rounded-xl border-2 bg-white transition",
          selected ? "border-brand ring-4 ring-brand-100" : "border-line opacity-60",
          !selectable && "opacity-100",
        )}
      >
        <div className="flex aspect-[1/1.414] items-center justify-center bg-white">
          <canvas ref={canvasRef} className={clsx("h-full w-full object-contain", !done && "hidden")} />
          {!done && <LoaderCircle className="h-5 w-5 animate-spin text-line" aria-hidden="true" />}
        </div>
      </button>
      <div className="mt-1 flex items-center justify-between text-sm">
        <span className="font-semibold">{page}</span>
        <button type="button" onClick={onZoom} className="flex h-9 w-9 items-center justify-center rounded-lg text-brand hover:bg-brand-50" aria-label={`Show page ${page} larger`}>
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {selectable && selected && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white shadow">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

function PageZoom({
  doc,
  page,
  pageCount,
  onClose,
  onChange,
}: {
  doc: PdfDoc;
  page: number;
  pageCount: number;
  onClose: () => void;
  onChange: (p: number) => void;
}) {
  const [width] = useState(() => Math.min(720, window.innerWidth - 32));
  const { canvasRef, done } = useRenderPage(doc, page, width, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Page ${page} preview`} className="fixed inset-0 z-50 flex flex-col bg-navy/90 p-4" onClick={onClose}>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">Page {page} of {pageCount}</p>
        <Button variant="secondary" className="h-11 min-h-11 w-11 shrink-0 px-0" aria-label="Close preview" onClick={onClose}>
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 items-start justify-center overflow-auto" onClick={(e) => e.stopPropagation()}>
        <canvas ref={canvasRef} style={{ width }} className={clsx("h-auto max-w-full rounded bg-white shadow-lg", !done && "opacity-50")} />
      </div>
      <div className="mx-auto mt-3 grid w-full max-w-3xl grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        <Button variant="secondary" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
