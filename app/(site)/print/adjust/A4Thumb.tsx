"use client";

import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { A4, computePlacement, drawPreview } from "@/lib/image-layout";
import { usePrintFlow } from "../PrintFlowProvider";
import { useSourceImage } from "./useSourceImage";

/** Small A4 page showing the adjusted image exactly as it will print. */
export function A4Thumb({ width = 96 }: { width?: number }) {
  const flow = usePrintFlow();
  const file = flow.file;
  const source = useSourceImage();
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round((width * A4.height) / A4.width);
  const adj = flow.settings.adjustment;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !source.img || !file?.imageWidth || !file.imageHeight) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    drawPreview(canvas.getContext("2d")!, source.img, computePlacement(file.imageWidth, file.imageHeight, adj), (width * dpr) / A4.width);
  }, [source.img, file?.imageWidth, file?.imageHeight, adj, width, height]);

  if (!source.img) {
    return (
      <div className="flex shrink-0 items-center justify-center rounded border border-line bg-white" style={{ width, height }}>
        <FileText className="h-6 w-6 text-brand" aria-hidden="true" />
      </div>
    );
  }
  return (
    <canvas
      ref={ref}
      data-testid="a4-thumb"
      role="img"
      aria-label="Your adjusted image on A4"
      style={{ width, height }}
      className="shrink-0 rounded-sm border border-line bg-white shadow-sm"
    />
  );
}
