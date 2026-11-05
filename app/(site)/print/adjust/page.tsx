"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { STEP, Stepper } from "@/components/Stepper";
import { Button, Container, PageTitle } from "@/components/ui";
import type { ImageAdjustment } from "@/lib/image-layout";
import { usePrintFlow } from "../PrintFlowProvider";
import { ActionBar } from "../parts";
import { ImageAdjuster } from "./ImageAdjuster";
import { PdfPages } from "./PdfPages";

export default function AdjustPage() {
  const flow = usePrintFlow();
  const router = useRouter();
  const file = flow.file;

  useEffect(() => {
    if (flow.hydrated && !flow.ready) router.replace("/print");
  }, [flow.hydrated, flow.ready, router]);

  if (!file || !flow.ready || !flow.line) return <Container className="py-10" />;
  const isImage = flow.line.isImage;

  return (
    <Container className="max-w-4xl py-6 sm:py-10">
      <Stepper current={STEP.adjust} />
      <PageTitle
        title={isImage ? "Adjust & preview" : "Preview & choose pages"}
        subtitle={
          isImage
            ? "Position your picture on the A4 page. What you see here is what will be printed."
            : `${file.name} · ${file.pageCount} page${file.pageCount === 1 ? "" : "s"}. The PDF is printed exactly as it is.`
        }
      />
      {isImage ? <ImageStep /> : <PdfPages />}
      <ContinueBar disabled={!!flow.line.pageError} />
    </Container>
  );
}

function ImageStep() {
  const flow = usePrintFlow();
  const { updateSettings } = flow;
  const onChange = useCallback((adjustment: ImageAdjustment) => updateSettings({ adjustment }), [updateSettings]);
  return <ImageAdjuster onAdjustmentChange={onChange} />;
}

function ContinueBar({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  return (
    <ActionBar>
      <Link href="/print" className="hidden items-center gap-1 rounded-xl px-3 font-semibold text-brand sm:flex">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Back
      </Link>
      <Button size="lg" disabled={disabled} onClick={() => router.push("/print/settings")} className="w-full sm:w-auto">
        Continue to settings <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </Button>
    </ActionBar>
  );
}
