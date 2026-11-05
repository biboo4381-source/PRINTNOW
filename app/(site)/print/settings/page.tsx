"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId } from "react";
import { ArrowLeft, ArrowRight, Minus, Palette, Plus } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { Button, Card, Container, PageTitle } from "@/components/ui";
import { LIMITS } from "@/lib/config";
import { formatRupiah } from "@/lib/pricing";
import { type LineSummary, usePrintFlow } from "../PrintFlowProvider";
import { ActionBar, FileThumb } from "../parts";

export default function SettingsPage() {
  const flow = usePrintFlow();
  const router = useRouter();

  useEffect(() => {
    if (flow.hydrated && flow.readyFiles.length === 0) router.replace("/print");
  }, [flow.hydrated, flow.readyFiles.length, router]);

  return (
    <Container className="max-w-3xl py-6 sm:py-10">
      <Stepper current={1} />
      <PageTitle
        title="Print settings"
        subtitle={
          <>
            Black &amp; white {formatRupiah(flow.prices.bwPricePerPage)}/page · Color {formatRupiah(flow.prices.colorPricePerPage)}/page
          </>
        }
      />

      <div className="space-y-4">
        {flow.lines.map((line, i) => (
          <FileSettingsCard key={line.file.localId} line={line} index={i} />
        ))}
      </div>

      <ActionBar total={flow.total} label={`Total · ${flow.totalPrintedPages} printed page${flow.totalPrintedPages === 1 ? "" : "s"}`}>
        <Link href="/print" className="hidden items-center gap-1 rounded-xl px-3 font-semibold text-brand sm:flex">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Back
        </Link>
        <Button size="lg" disabled={!flow.linesValid} onClick={() => router.push("/print/review")}>
          Review <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </ActionBar>
    </Container>
  );
}

function FileSettingsCard({ line, index }: { line: LineSummary; index: number }) {
  const flow = usePrintFlow();
  const id = useId();
  const fileId = line.file.fileId!;
  const s = line.settings;
  const pageCount = line.file.pageCount ?? 1;
  const set = (patch: Parameters<typeof flow.updateSettings>[1]) => flow.updateSettings(fileId, patch);

  return (
    <Card className="p-4 sm:p-6" data-testid="settings-card">
      <div className="flex items-center gap-3">
        <FileThumb file={line.file} className="h-14 w-11" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-muted">File {index + 1}</p>
          <h2 className="truncate text-lg font-bold" title={line.file.name}>{line.file.name}</h2>
          <p className="text-sm text-ink-muted">
            {pageCount} page{pageCount === 1 ? "" : "s"} · A4 paper
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Print mode */}
        <fieldset>
          <legend className="mb-2 font-semibold">Print mode</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(
              [
                { value: "BW", label: "Black & White", price: flow.prices.bwPricePerPage },
                { value: "COLOR", label: "Color", price: flow.prices.colorPricePerPage },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={clsx(
                  "flex min-h-16 cursor-pointer flex-col justify-center rounded-2xl border-2 px-3 py-2 text-center transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-100",
                  s.colorMode === opt.value ? "border-brand bg-brand-50" : "border-line hover:border-brand/50",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={opt.value}
                  checked={s.colorMode === opt.value}
                  onChange={() => set({ colorMode: opt.value })}
                  className="sr-only"
                />
                <span className="flex items-center justify-center gap-1.5 font-bold">
                  {opt.value === "COLOR" ? (
                    <Palette className="h-4 w-4 text-brand" aria-hidden="true" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full bg-navy" aria-hidden="true" />
                  )}
                  {opt.label}
                </span>
                <span className="text-xs text-ink-muted">{formatRupiah(opt.price)} / page</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Copies */}
        <div>
          <label htmlFor={`${id}-copies`} className="mb-2 block font-semibold">
            Copies
          </label>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-14 w-14 shrink-0 px-0"
              aria-label="Fewer copies"
              disabled={s.copies <= LIMITS.minCopies}
              onClick={() => set({ copies: Math.max(LIMITS.minCopies, s.copies - 1) })}
            >
              <Minus className="h-5 w-5" aria-hidden="true" />
            </Button>
            <input
              id={`${id}-copies`}
              type="number"
              inputMode="numeric"
              min={LIMITS.minCopies}
              max={LIMITS.maxCopies}
              value={Number.isFinite(s.copies) ? s.copies : ""}
              onChange={(e) => set({ copies: e.target.value === "" ? NaN : Math.floor(Number(e.target.value)) })}
              className="h-14 w-full min-w-0 rounded-2xl border-2 border-line text-center text-xl font-bold focus:border-brand focus:outline-none"
            />
            <Button
              variant="secondary"
              className="h-14 w-14 shrink-0 px-0"
              aria-label="More copies"
              disabled={s.copies >= LIMITS.maxCopies}
              onClick={() => set({ copies: Math.min(LIMITS.maxCopies, (Number.isFinite(s.copies) ? s.copies : 0) + 1) })}
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Pages */}
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 font-semibold">Pages</legend>
          {pageCount === 1 ? (
            <p className="rounded-2xl bg-surface px-4 py-3 text-ink-muted">This file has 1 page.</p>
          ) : (
            <>
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
                      s.pageMode === opt.value ? "border-brand bg-brand-50" : "border-line hover:border-brand/50",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${id}-pages`}
                      value={opt.value}
                      checked={s.pageMode === opt.value}
                      onChange={() => set({ pageMode: opt.value })}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {s.pageMode === "custom" && (
                <div className="mt-3">
                  <label htmlFor={`${id}-range`} className="text-sm font-medium text-ink-muted">
                    Pages to print, for example <span className="font-mono">1-3, 5</span>
                  </label>
                  <input
                    id={`${id}-range`}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    placeholder={`1-${Math.min(3, pageCount)}, ${Math.min(5, pageCount)}`}
                    value={s.customPages}
                    onChange={(e) => set({ customPages: e.target.value })}
                    aria-invalid={!!line.error}
                    aria-describedby={line.error ? `${id}-range-error` : undefined}
                    className={clsx(
                      "mt-1 h-14 w-full rounded-2xl border-2 px-4 font-mono text-lg focus:outline-none",
                      line.error ? "border-danger" : "border-line focus:border-brand",
                    )}
                  />
                </div>
              )}
            </>
          )}
          {line.error && (
            <p id={`${id}-range-error`} className="mt-2 text-sm font-medium text-danger" role="alert">
              {line.error}
            </p>
          )}
        </fieldset>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface px-4 py-3" data-testid="line-summary">
        <p className="text-sm text-ink-muted">
          {line.selectedPageCount} page{line.selectedPageCount === 1 ? "" : "s"} × {Number.isFinite(s.copies) ? s.copies : 0} cop
          {s.copies === 1 ? "y" : "ies"} = <strong className="text-navy">{line.printedPages} printed</strong> ·{" "}
          {formatRupiah(line.pricePerPage)}/page
        </p>
        <p className="font-display text-lg font-extrabold" data-testid="line-subtotal">{formatRupiah(line.subtotal)}</p>
      </div>
    </Card>
  );
}
