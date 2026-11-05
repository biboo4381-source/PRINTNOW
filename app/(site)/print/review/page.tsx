"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, Lock, Pencil } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { Alert, Button, Card, Container, PageTitle } from "@/components/ui";
import { formatRupiah } from "@/lib/pricing";
import { usePrintFlow } from "../PrintFlowProvider";
import { ActionBar, FileThumb } from "../parts";

export default function ReviewPage() {
  const flow = usePrintFlow();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!flow.hydrated || submitting) return;
    if (flow.readyFiles.length === 0) router.replace("/print");
    else if (!flow.linesValid) router.replace("/print/settings");
  }, [flow.hydrated, flow.readyFiles.length, flow.linesValid, router, submitting]);

  async function createOrder() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: flow.lines.map((l) => ({
            fileId: l.file.fileId,
            colorMode: l.settings.colorMode,
            copies: l.settings.copies,
            pageSelection: l.pageSelection,
          })),
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

  return (
    <Container className="max-w-3xl py-6 sm:py-10">
      <Stepper current={1} />
      <PageTitle title="Review your order" subtitle="Check everything before you pay." />

      <Card className="divide-y divide-line">
        {flow.lines.map((l) => (
          <div key={l.file.localId} className="flex gap-3 p-4 sm:gap-4 sm:p-5" data-testid="review-line">
            <FileThumb file={l.file} className="h-16 w-12" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold" title={l.file.name}>{l.file.name}</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm text-ink-muted sm:grid-cols-4">
                <div><dt className="inline">Mode: </dt><dd className="inline font-semibold text-navy">{l.settings.colorMode === "COLOR" ? "Color" : "Black & White"}</dd></div>
                <div><dt className="inline">Copies: </dt><dd className="inline font-semibold text-navy">{l.settings.copies}</dd></div>
                <div><dt className="inline">Pages: </dt><dd className="inline font-semibold text-navy">{l.pageSelection === "all" ? `All (${l.file.pageCount})` : l.pageSelection}</dd></div>
                <div><dt className="inline">Paper: </dt><dd className="inline font-semibold text-navy">A4</dd></div>
              </dl>
              <p className="mt-1 text-sm text-ink-muted">
                {l.printedPages} printed page{l.printedPages === 1 ? "" : "s"} × {formatRupiah(l.pricePerPage)}
              </p>
            </div>
            <p className="font-display font-extrabold">{formatRupiah(l.subtotal)}</p>
          </div>
        ))}
        <div className="flex items-center justify-between p-4 sm:p-5">
          <Link href="/print/settings" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand">
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit settings
          </Link>
          <p className="text-sm text-ink-muted">{flow.totalPrintedPages} printed pages in total</p>
        </div>
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
        <Lock className="h-4 w-4" aria-hidden="true" /> The final price is confirmed by our server before payment.
      </p>

      <ActionBar total={flow.total}>
        <Link href="/print/settings" className="hidden items-center gap-1 rounded-xl px-3 font-semibold text-brand sm:flex">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Back
        </Link>
        <Button size="lg" onClick={createOrder} disabled={submitting || !flow.linesValid}>
          {submitting && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
          Continue to payment
        </Button>
      </ActionBar>
    </Container>
  );
}
