"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { CROP_MIN, type CropRect, FULL_CROP, type Rotation, cropFromView, cropToView } from "@/lib/image-layout";
import { useElementWidth, useViewportHeight } from "./useSourceImage";

type Handle = "move" | "nw" | "ne" | "sw" | "se";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Crop on the image as the customer sees it (already rotated). The rectangle is converted back
 * to un-rotated image coordinates when applied, which is what the server renders from.
 */
export function CropEditor({
  image,
  width,
  height,
  rotation,
  crop,
  onApply,
  onCancel,
}: {
  image: HTMLImageElement | null;
  width: number;
  height: number;
  rotation: Rotation;
  crop: CropRect;
  onApply: (crop: CropRect) => void;
  onCancel: () => void;
}) {
  const sideways = rotation === 90 || rotation === 270;
  const viewW = sideways ? height : width;
  const viewH = sideways ? width : height;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const available = useElementWidth(wrapRef);
  const maxH = Math.max(260, useViewportHeight() - 240);
  const scale = Math.min((available || 320) / viewW, maxH / viewH);
  const cssW = Math.max(1, Math.round(viewW * scale));
  const cssH = Math.max(1, Math.round(viewH * scale));

  const [rect, setRect] = useState<CropRect>(() => cropToView(crop, rotation));

  // Draw the rotated image.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    const w = width * scale * dpr;
    const h = height * scale * dpr;
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }, [image, rotation, width, height, scale, cssW, cssH]);

  const drag = useRef<{ handle: Handle; x: number; y: number; start: CropRect } | null>(null);

  function onDown(e: React.PointerEvent<HTMLElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const handle = (e.currentTarget.dataset.handle ?? "move") as Handle;
    drag.current = { handle, x: e.clientX, y: e.clientY, start: rect };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / cssW;
    const dy = (e.clientY - d.y) / cssH;
    const s = d.start;
    let { x, y, w, h } = s;
    if (d.handle === "move") {
      x = clamp(s.x + dx, 0, 1 - s.w);
      y = clamp(s.y + dy, 0, 1 - s.h);
    } else {
      const right = s.x + s.w;
      const bottom = s.y + s.h;
      if (d.handle.includes("w")) {
        x = clamp(s.x + dx, 0, right - CROP_MIN);
        w = right - x;
      }
      if (d.handle.includes("e")) w = clamp(s.w + dx, CROP_MIN, 1 - s.x);
      if (d.handle.includes("n")) {
        y = clamp(s.y + dy, 0, bottom - CROP_MIN);
        h = bottom - y;
      }
      if (d.handle.includes("s")) h = clamp(s.h + dy, CROP_MIN, 1 - s.y);
    }
    setRect({ x, y, w, h });
  }
  function end() {
    drag.current = null;
  }

  const corner = (h: Exclude<Handle, "move">, pos: string) => (
    <button
      type="button"
      aria-label={`Resize crop from ${h.replace("n", "top ").replace("s", "bottom ").replace("w", "left").replace("e", "right")}`}
      data-handle={h}
      onPointerDown={onDown}
      className={`absolute flex h-11 w-11 ${pos}`}
      style={{ touchAction: "none" }}
    >
      <span className="m-[-2px] h-5 w-5 rounded-md border-[3px] border-white bg-brand shadow" />
    </button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="crop-title" className="fixed inset-0 z-50 overflow-y-auto bg-surface">
     <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:py-8">
      <h2 id="crop-title" className="text-2xl font-extrabold">Crop image</h2>
      <p className="mb-3 mt-1 text-ink-muted">Drag the box or its corners to choose the part of the picture to keep.</p>
      <div ref={wrapRef} className="flex w-full justify-center rounded-[var(--radius-card)] bg-[#dfe7f1] p-3 sm:p-5">
        <div className="relative select-none overflow-hidden" style={{ width: cssW, height: cssH }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <canvas ref={canvasRef} style={{ width: cssW, height: cssH }} className="block" />
          <div
            data-testid="crop-box"
            className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgb(12_44_85/0.55)] outline outline-1 outline-brand"
            style={{
              left: rect.x * cssW,
              top: rect.y * cssH,
              width: rect.w * cssW,
              height: rect.h * cssH,
              touchAction: "none",
            }}
            data-handle="move"
            onPointerDown={onDown}
          >
            {/* rule-of-thirds guides */}
            <span className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/50" />
            <span className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/50" />
            <span className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/50" />
            <span className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/50" />
            {corner("nw", "left-0 top-0 items-start justify-start")}
            {corner("ne", "right-0 top-0 items-start justify-end")}
            {corner("sw", "bottom-0 left-0 items-end justify-start")}
            {corner("se", "bottom-0 right-0 items-end justify-end")}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button variant="ghost" className="px-2" onClick={onCancel}>
          <X className="h-5 w-5" aria-hidden="true" /> Cancel
        </Button>
        <Button variant="secondary" className="px-2" onClick={() => setRect(cropToView(FULL_CROP, rotation))}>
          <Undo2 className="h-5 w-5" aria-hidden="true" /> Reset
        </Button>
        <Button className="px-2" onClick={() => onApply(cropFromView(rect, rotation))}>
          <Check className="h-5 w-5" aria-hidden="true" /> Apply
        </Button>
      </div>
     </div>
    </div>
  );
}
