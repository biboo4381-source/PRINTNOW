"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, Lock, Minus, Palette, Pencil, Plus } from "lucide-react";
import { STEP, Stepper } from "@/components/Stepper";
import { Alert, Button, Card, Container, PageTitle } from "@/components/ui";
import { LIMITS } from "@/lib/config";
import { isDefaultAdjustment } from "@/lib/image-layout";
import { formatRupiah } from "@/lib/pricing";
import { usePrintFlow } from "../PrintFlowProvider";
import { A4Thumb } from "../adjust/A4Thumb";
import { ActionBar, FileThumb } from "../parts";

export default function SettingsPage() {
  const flow = usePrintFlow();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const line = flow.line;

  useEffect(() => {
    if (!flow.hydrated || submitting) return;
    if (!flow.ready) router.replace("/print");
    else if (flow.line?.pageError) router.replace("/print/adjust");
  }, [flow.hydrated, flow.ready, flow.line?.pageError, router, submitting]);

  if (!line) return <Container className="py-10" />;
  const { settings, file } = line;
  const pageCount = file.pageCount ?? 1;
  const valid = !line.pageError && !line.copiesError;

  async function createOrder() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: {
            fileId: file.fileId,
            colorMode: settings.colorMode,
            copies: settings.copies,
            pageSelection: line!.pageSelection,
            ...(line!.isImage ? { imageAdjustment: settings.adjustment } : {}),
          },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "We couldn't create your order. Please try again.");
      router.push(`/pay/${body.orderId}`);
      flow.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't create your order. Please try again.");
      setSubmitting(false);
    }
  }

  const set = flow.updateSettings;
  const pagesLabel = line.isImage ? "1 (A4)" : line.pageSelection === "all" ? `All (${pageCount})` : `${line.pageSelection} (${line.selectedPageCount} of ${pageCount})`;

  return (
    <Container className="max-w-3xl py-6 sm:py-10">
      <Stepper current={STEP.settings} />
      <PageTitle
        title="Print settings"
        subtitle={
          <>
            Black &amp; white {formatRupiah(flow.prices.bwPricePerPage)}/page · Color {formatRupiah(flow.prices.colorPricePerPage)}/page
          </>
        }
      />

      <Card className="p-4 sm:p-6" data-testid="settings-card">
        {/* Document */}
        <div className="flex items-center gap-4">
          {line.isImage ? <A4Thumb width={72} /> : <FileThumb file={file} className="h-[6.25rem] w-[4.5rem]" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-muted">Your document</p>
            <h2 className="break-words text-lg font-bold leading-snug">{file.name}</h2>
            <p className="text-sm text-ink-muted">
              {line.isImage
                ? isDefaultAdjustment(settings.adjustment)
                  ? "Image fitted to A4"
                  : "Image adjusted for A4"
                : `Pages: ${pagesLabel}`}
            </p>
            <Link href="/print/adjust" className="mt-1 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand">
              <Pencil className="h-4 w-4" aria-hidden="true" /> {line.isImage ? "Edit image" : "Change pages"}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 font-semibold">Print mode</legend>
            <div className="grid grid-cols-2 gap-2">
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
                    settings.colorMode === opt.value ? "border-brand bg-brand-50" : "border-line hover:border-brand/50",
                  )}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={opt.value}
                    checked={settings.colorMode === opt.value}
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

          <div>
            <label htmlFor="copies" className="mb-2 block font-semibold">
              Copies
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="h-14 w-14 shrink-0 px-0"
                aria-label="Fewer copies"
                disabled={!(settings.copies > LIMITS.minCopies)}
                onClick={() => set({ copies: Math.max(LIMITS.minCopies, settings.copies - 1) })}
              >
                <Minus className="h-5 w-5" aria-hidden="true" />
              </Button>
              <input
                id="copies"
                type="number"
                inputMode="numeric"
                min={LIMITS.minCopies}
                max={LIMITS.maxCopies}
                value={Number.isFinite(settings.copies) ? settings.copies : ""}
                onChange={(e) => set({ copies: e.target.value === "" ? NaN : Math.floor(Number(e.target.value)) })}
                aria-invalid={!!line.copiesError}
                className="h-14 w-full min-w-0 rounded-2xl border-2 border-line text-center text-xl font-bold focus:border-brand focus:outline-none"
              />
              <Button
                variant="secondary"
                className="h-14 w-14 shrink-0 px-0"
                aria-label="More copies"
                disabled={settings.copies >= LIMITS.maxCopies}
                onClick={() => set({ copies: Math.min(LIMITS.maxCopies, (Number.isFinite(settings.copies) ? settings.copies : 0) + 1) })}
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
            {line.copiesError && (
              <p className="mt-2 text-sm font-medium text-danger" role="alert">{line.copiesError}</p>
            )}
          </div>
        </div>
        <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm text-ink-muted">
          Paper: <strong className="text-navy">A4</strong>, single-sided.
        </p>
      </Card>

      <Card className="mt-4 p-4 sm:p-6" data-testid="order-summary">
        <h2 className="text-lg font-bold">Order summary</h2>
        <dl className="mt-3 divide-y divide-line text-[0.95rem]">
          {[
            ["Document", file.name],
            ["Pages", pagesLabel],
            ["Print mode", settings.colorMode === "COLOR" ? "Color" : "Black & White"],
            ["Copies", Number.isFinite(settings.copies) ? String(settings.copies) : "–"],
            ["Paper", "A4"],
            ["Printed pages", `${line.selectedPageCount} × ${Number.isFinite(settings.copies) ? settings.copies : 0} = ${line.printedPages}`],
            ["Price per page", formatRupiah(line.pricePerPage)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="shrink-0 text-ink-muted">{k}</dt>
              <dd className="min-w-0 break-words text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {error && (
        <Alert tone="error" className="mt-4" title="Order not created">
          {error}{" "}
          {/no longer available|upload it again/i.test(error) && (
            <Link href="/print" className="font-semibold text-brand underline" onClick={() => flow.reset()}>
              Start again
            </Link>
          )}
        </Alert>
      )}

      <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" /> The final price is confirmed by our server before payment.
      </p>

      <ActionBar total={line.subtotal} label={`Total · ${line.printedPages} printed page${line.printedPages === 1 ? "" : "s"}`}>
        <Link href="/print/adjust" className="hidden items-center gap-1 rounded-xl px-3 font-semibold text-brand sm:flex">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Back
        </Link>
        <Button size="lg" onClick={createOrder} disabled={submitting || !valid}>
          {submitting && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
          {submitting ? "Preparing…" : "Go to payment"}
        </Button>
      </ActionBar>
    </Container>
  );
}
