"use client";

import clsx from "clsx";
import { FileText, ImageIcon } from "lucide-react";
import { formatRupiah } from "@/lib/pricing";
import type { DraftFile } from "./PrintFlowProvider";

export function FileThumb({ file, className }: { file: Pick<DraftFile, "thumb" | "format" | "name">; className?: string }) {
  const isImage = file.format === "JPG" || file.format === "PNG" || /\.(jpe?g|png)$/i.test(file.name);
  return (
    <div className={clsx("flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface", className ?? "h-20 w-16")}>
      {file.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.thumb} alt="" className="h-full w-full object-contain" />
      ) : isImage ? (
        <ImageIcon className="h-7 w-7 text-brand" aria-hidden="true" />
      ) : (
        <FileText className="h-7 w-7 text-brand" aria-hidden="true" />
      )}
    </div>
  );
}

/** Bottom action bar: sticky on phones so the main action is always reachable. */
export function ActionBar({ children, total, label = "Total" }: { children: React.ReactNode; total?: number; label?: string }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-[var(--radius-card)] sm:border-0 sm:p-5 sm:shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-4">
        {total !== undefined ? (
          <div aria-live="polite">
            <p className="text-sm font-medium text-ink-muted">{label}</p>
            <p className="font-display text-2xl font-extrabold" data-testid="order-total">{formatRupiah(total)}</p>
          </div>
        ) : (
          <span />
        )}
        <div className="flex flex-1 justify-end gap-3 sm:flex-none">{children}</div>
      </div>
    </div>
  );
}
