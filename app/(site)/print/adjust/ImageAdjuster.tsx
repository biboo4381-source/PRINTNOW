"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Crop, Maximize, Minimize, Minus, Plus, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import {
  A4,
  DEFAULT_ADJUSTMENT,
  type ImageAdjustment,
  type Rotation,
  ZOOM_MAX,
  ZOOM_MIN,
  computePlacement,
  drawPreview,
  effectiveDpi,
} from "@/lib/image-layout";
import { usePrintFlow } from "../PrintFlowProvider";
import { CropEditor } from "./CropEditor";
import { useElementWidth, useSourceImage, useViewportHeight } from "./useSourceImage";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ZOOM_UI_MAX = 3;

export function ImageAdjuster({ onAdjustmentChange }: { onAdjustmentChange: (a: ImageAdjustment) => void }) {
  const flow = usePrintFlow();
  const file = flow.file!;
  const W = file.imageWidth ?? 1;
  const H = file.imageHeight ?? 1;
  const [adj, setAdj] = useState<ImageAdjustment>(flow.settings.adjustment ?? DEFAULT_ADJUSTMENT);
  const [cropping, setCropping] = useState(false);
  const source = useSourceImage();
  const placement = computePlacement(W, H, adj);
  const dpi = effectiveDpi(placement);

  // Report changes upward (debounced so dragging stays smooth) and always on leaving the step.
  const latest = useRef(adj);
  useEffect(() => {
    latest.current = adj;
    const t = setTimeout(() => onAdjustmentChange(adj), 120);
    return () => clearTimeout(t);
  }, [adj, onAdjustmentChange]);
  useEffect(() => () => onAdjustmentChange(latest.current), [onAdjustmentChange]);

  const rotate = (dir: 1 | -1) =>
    setAdj((a) => ({ ...a, rotation: (((a.rotation + dir * 90) % 360) + 360) % 360 as Rotation, offsetX: 0, offsetY: 0 }));
  const setZoom = (z: number) => setAdj((a) => ({ ...a, zoom: clamp(Math.round(z * 100) / 100, ZOOM_MIN, ZOOM_MAX) }));

  if (cropping) {
    return (
      <CropEditor
        image={source.img}
        width={W}
        height={H}
        rotation={adj.rotation}
        crop={adj.crop}
        onCancel={() => setCropping(false)}
        onApply={(crop) => {
          setAdj((a) => ({ ...a, crop, offsetX: 0, offsetY: 0 }));
          setCropping(false);
        }}
      />
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-start">
      <div>
        {source.status === "missing" && (
          <Alert tone="warning" className="mb-3" title="Preview not available">
            We couldn’t load your image in this browser. Your settings still apply. To see the preview again, go back and replace the file.
          </Alert>
        )}
        <PagePreview image={source.img} adj={adj} width={W} height={H} onChange={setAdj} />
        <p className="mt-2 text-center text-sm text-ink-muted">
          <span className="mr-1 inline-block h-0 w-5 border-t-2 border-dashed border-brand align-middle" aria-hidden="true" />
          Printable area of the A4 page. Anything outside the dashed line won’t print.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-2 font-semibold">Rotate &amp; crop</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" className="px-2" onClick={() => rotate(-1)} aria-label="Rotate left 90 degrees">
              <RotateCcw className="h-5 w-5" aria-hidden="true" /> <span className="sr-only sm:not-sr-only">Left</span>
            </Button>
            <Button variant="secondary" className="px-2" onClick={() => rotate(1)} aria-label="Rotate right 90 degrees">
              <RotateCw className="h-5 w-5" aria-hidden="true" /> <span className="sr-only sm:not-sr-only">Right</span>
            </Button>
            <Button variant="secondary" className="px-2" onClick={() => setCropping(true)} disabled={!source.img}>
              <Crop className="h-5 w-5" aria-hidden="true" /> Crop
            </Button>
          </div>
        </div>

        <div>
          <label htmlFor="zoom" className="mb-2 flex items-center justify-between font-semibold">
            Size <span className="text-sm font-medium text-ink-muted" data-testid="zoom-value">{Math.round(adj.zoom * 100)}%</span>
          </label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="h-12 w-12 shrink-0 px-0" aria-label="Smaller" onClick={() => setZoom(adj.zoom - 0.1)} disabled={adj.zoom <= ZOOM_MIN}>
              <Minus className="h-5 w-5" aria-hidden="true" />
            </Button>
            <input
              id="zoom"
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_UI_MAX}
              step={0.01}
              value={Math.min(adj.zoom, ZOOM_UI_MAX)}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-12 w-full min-w-0 accent-[var(--color-brand)]"
            />
            <Button variant="secondary" className="h-12 w-12 shrink-0 px-0" aria-label="Larger" onClick={() => setZoom(adj.zoom + 0.1)} disabled={adj.zoom >= ZOOM_UI_MAX}>
              <Plus className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 font-semibold">Fit on A4</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className={clsx("px-2", adj.zoom === 1 && adj.offsetX === 0 && adj.offsetY === 0 && "border-brand text-brand")}
              onClick={() => setAdj((a) => ({ ...a, zoom: 1, offsetX: 0, offsetY: 0 }))}
            >
              <Minimize className="h-5 w-5" aria-hidden="true" /> Fit to A4
            </Button>
            <Button
              variant="secondary"
              className="px-2"
              onClick={() => setAdj((a) => ({ ...a, zoom: Math.round(placement.fillZoom * 100) / 100, offsetX: 0, offsetY: 0 }))}
            >
              <Maximize className="h-5 w-5" aria-hidden="true" /> Fill page
            </Button>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            <strong className="text-navy">Fit</strong> shows the whole picture. <strong className="text-navy">Fill</strong> covers the page and may cut off edges.
            Proportions are always kept.
          </p>
        </div>

        <Button variant="ghost" className="w-full" onClick={() => setAdj(DEFAULT_ADJUSTMENT)}>
          <Undo2 className="h-5 w-5" aria-hidden="true" /> Reset all changes
        </Button>

        {dpi < 150 && (
          <Alert tone="warning" title="May print blurry">
            At this size the image is about {Math.round(dpi)} dpi. Make it smaller or use a higher-resolution image for a sharper print.
          </Alert>
        )}
      </div>
    </div>
  );
}

/** A4 page preview. Drag to move; pinch (or Ctrl + scroll) to resize. */
function PagePreview({
  image,
  adj,
  width,
  height,
  onChange,
}: {
  image: HTMLImageElement | null;
  adj: ImageAdjustment;
  width: number;
  height: number;
  onChange: (fn: (a: ImageAdjustment) => ImageAdjustment) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const available = useElementWidth(wrapRef);
  // Keep the whole page visible on phones: limit by width and by ~62% of the screen height.
  const maxH = Math.max(300, Math.round(useViewportHeight() * 0.62));
  const cssW = Math.max(160, Math.min(available || 320, Math.round((maxH * A4.width) / A4.height)));
  const cssH = Math.round((cssW * A4.height) / A4.width);
  const pxPerMm = cssW / A4.width;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d")!;
    const p = computePlacement(width, height, adj);
    if (image) {
      drawPreview(ctx, image, p, pxPerMm * dpr, { showMargins: true });
    } else {
      // No image available: show where it would go.
      const k = pxPerMm * dpr;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#dce5ef";
      ctx.fillRect((p.center.x - p.size.width / 2) * k, (p.center.y - p.size.height / 2) * k, p.size.width * k, p.size.height * k);
    }
  }, [image, adj, width, height, cssW, cssH, pxPerMm]);

  // Pointer gestures
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startZoom: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: adj.zoom };
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const g = gesture.current;
      onChange((s) => ({ ...s, zoom: clamp(g.startZoom * (dist / g.startDist), ZOOM_MIN, ZOOM_MAX) }));
      return;
    }
    const dx = (next.x - prev.x) / pxPerMm;
    const dy = (next.y - prev.y) / pxPerMm;
    onChange((s) => ({
      ...s,
      offsetX: clamp(s.offsetX + dx, -A4.width / 2, A4.width / 2),
      offsetY: clamp(s.offsetY + dy, -A4.height / 2, A4.height / 2),
    }));
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }

  return (
    <div ref={wrapRef} className="flex w-full justify-center rounded-[var(--radius-card)] bg-[#dfe7f1] p-3 sm:p-5">
      <canvas
        ref={canvasRef}
        data-testid="a4-preview"
        role="img"
        aria-label="Preview of your image on an A4 page. Drag to move it."
        style={{ width: cssW, height: cssH, touchAction: "none" }}
        className="cursor-grab rounded-sm bg-white shadow-[0_4px_18px_rgb(12_44_85/0.18)] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          onChange((s) => ({ ...s, zoom: clamp(s.zoom * (e.deltaY < 0 ? 1.05 : 0.95), ZOOM_MIN, ZOOM_MAX) }));
        }}
      />
    </div>
  );
}
