"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, CircleCheck, CloudUpload, FolderOpen, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { STEP, Stepper } from "@/components/Stepper";
import { Alert, Button, Container, PageTitle } from "@/components/ui";
import { ACCEPT_ATTRIBUTE, LIMITS, formatBytes } from "@/lib/config";
import { usePrintFlow } from "./PrintFlowProvider";
import { ActionBar, FileThumb } from "./parts";

export default function UploadPage() {
  const flow = usePrintFlow();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const file = flow.file;
  const busy = file?.status === "uploading" || file?.status === "verifying";

  const pickFile = () => inputRef.current?.click();

  return (
    <Container className="max-w-3xl py-6 sm:py-10">
      <Stepper current={STEP.upload} />
      <PageTitle title="Upload your document" subtitle="Choose one file to print. We’ll check it before you continue." />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        aria-label="Choose a file to print"
        data-testid="file-input"
        onChange={(e) => {
          if (e.target.files?.length) flow.chooseFromList(e.target.files);
          e.target.value = "";
        }}
      />

      {!file ? (
        <div
          data-testid="dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) flow.chooseFromList(e.dataTransfer.files);
          }}
          className={clsx(
            "flex flex-col items-center rounded-[var(--radius-card)] border-2 border-dashed bg-white px-6 py-10 text-center transition-colors",
            dragging ? "border-brand bg-brand-50" : "border-brand/40",
          )}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand">
            <CloudUpload className="h-8 w-8" aria-hidden="true" />
          </span>
          <p className="mt-4 text-xl font-bold">
            <span className="hidden sm:inline">Drag &amp; drop your file here</span>
            <span className="sm:hidden">Choose a file from your phone</span>
          </p>
          <p className="mt-1 text-ink-muted">PDF, JPG or PNG · up to {formatBytes(LIMITS.maxFileBytes)}</p>
          <p className="mt-1 text-sm text-ink-muted">A PDF can have as many pages as you need.</p>
          <Button size="lg" className="mt-5 w-full sm:w-auto" onClick={pickFile}>
            <FolderOpen className="h-6 w-6" aria-hidden="true" /> Browse files
          </Button>
        </div>
      ) : (
        <section aria-label="Your document">
          <div
            className={clsx(
              "rounded-[var(--radius-card)] border-2 bg-white p-4 sm:p-5",
              file.status === "error" ? "border-danger/40" : "border-transparent shadow-[var(--shadow-card)]",
            )}
            data-testid="file-row"
            data-status={file.status}
          >
            <div className="flex gap-4">
              <FileThumb file={file} className="h-28 w-[5.5rem] sm:h-32 sm:w-24" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold leading-snug" title={file.name}>{file.name}</p>
                <dl className="mt-1 space-y-0.5 text-sm text-ink-muted">
                  {file.format && (
                    <div>
                      <dt className="inline">Format: </dt>
                      <dd className="inline font-semibold text-navy">{file.format}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline">Size: </dt>
                    <dd className="inline font-semibold text-navy">{formatBytes(file.sizeBytes)}</dd>
                  </div>
                  {file.format === "PDF" && file.pageCount && (
                    <div>
                      <dt className="inline">Pages: </dt>
                      <dd className="inline font-semibold text-navy">{file.pageCount}</dd>
                    </div>
                  )}
                  {file.imageWidth && file.imageHeight && (
                    <div>
                      <dt className="inline">Image: </dt>
                      <dd className="inline font-semibold text-navy">
                        {file.imageWidth} × {file.imageHeight} px
                      </dd>
                    </div>
                  )}
                </dl>

                {busy && (
                  <div className="mt-2" aria-live="polite">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-surface"
                      role="progressbar"
                      aria-valuenow={file.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Uploading ${file.name}`}
                    >
                      <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${file.progress}%` }} />
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {file.status === "uploading" ? `Uploading… ${file.progress}%` : "Checking file…"}
                    </p>
                  </div>
                )}
                {file.status === "ready" && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-green">
                    <CircleCheck className="h-4 w-4" aria-hidden="true" /> Ready to print
                  </p>
                )}
                {file.status === "error" && (
                  <p className="mt-2 text-sm font-medium text-danger" role="alert">{file.error}</p>
                )}
              </div>
            </div>
            {!busy && (
              <div className="mt-4 flex gap-2 border-t border-line pt-3">
                <Button variant="ghost" className="min-h-11 flex-1 px-3 sm:flex-none" onClick={pickFile}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Replace
                </Button>
                <Button variant="ghost" className="min-h-11 flex-1 px-3 text-danger hover:bg-danger-50 sm:flex-none" onClick={flow.removeFile}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      {flow.notice && <Alert tone="info" className="mt-4" title={flow.notice} />}

      <ActionBar>
        <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
          <Button size="lg" disabled={!flow.ready} onClick={() => router.push("/print/adjust")} className="w-full sm:w-auto">
            Continue <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Button>
          {!flow.ready && (
            <p className="text-center text-sm text-ink-muted sm:text-right">
              {busy ? "Waiting for the upload to finish…" : file?.status === "error" ? "Replace or remove the file to continue." : "Upload a file to continue."}
            </p>
          )}
        </div>
      </ActionBar>
    </Container>
  );
}
