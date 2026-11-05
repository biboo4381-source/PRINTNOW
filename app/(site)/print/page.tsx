"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, CircleCheck, CloudUpload, FolderOpen, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { Alert, Button, Container, PageTitle } from "@/components/ui";
import { ACCEPT_ATTRIBUTE, LIMITS, formatBytes } from "@/lib/config";
import { type DraftFile, usePrintFlow } from "./PrintFlowProvider";
import { ActionBar, FileThumb } from "./parts";

export default function UploadPage() {
  const flow = usePrintFlow();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const busy = flow.files.some((f) => f.status === "uploading" || f.status === "verifying");
  const hasErrors = flow.files.some((f) => f.status === "error");
  const canContinue = flow.readyFiles.length > 0 && !busy && !hasErrors;
  const full = flow.files.length >= LIMITS.maxFilesPerOrder;

  return (
    <Container className="max-w-3xl py-6 sm:py-10">
      <Stepper current={0} />
      <PageTitle title="Upload your documents" subtitle="Add the files you want to print. We’ll check each one before you continue." />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) flow.addFiles(e.dataTransfer.files);
        }}
        className={clsx(
          "flex flex-col items-center rounded-[var(--radius-card)] border-2 border-dashed bg-white px-6 py-10 text-center transition-colors",
          dragging ? "border-brand bg-brand-50" : "border-brand/40",
          full && "opacity-60",
        )}
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand">
          <CloudUpload className="h-8 w-8" aria-hidden="true" />
        </span>
        <p className="mt-4 text-xl font-bold">
          <span className="hidden sm:inline">Drag &amp; drop files here</span>
          <span className="sm:hidden">Choose files from your phone</span>
        </p>
        <p className="mt-1 text-ink-muted">
          PDF, JPG or PNG · up to {formatBytes(LIMITS.maxFileBytes)} each · max {LIMITS.maxFilesPerOrder} files
        </p>
        <Button size="lg" className="mt-5 w-full sm:w-auto" onClick={() => inputRef.current?.click()} disabled={full}>
          <FolderOpen className="h-6 w-6" aria-hidden="true" /> Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-label="Choose files to print"
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files?.length) flow.addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {flow.notice && (
        <Alert tone="warning" className="mt-4" title={flow.notice} />
      )}

      {flow.files.length > 0 && (
        <section aria-label="Your files" className="mt-6">
          <h2 className="mb-3 text-lg font-bold">
            Your files <span className="font-medium text-ink-muted">({flow.files.length}/{LIMITS.maxFilesPerOrder})</span>
          </h2>
          <ul className="space-y-3">
            {flow.files.map((f) => (
              <FileRow key={f.localId} file={f} />
            ))}
          </ul>
        </section>
      )}

      <ActionBar>
        <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
          <Button size="lg" disabled={!canContinue} onClick={() => router.push("/print/settings")} className="w-full sm:w-auto">
            Continue <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Button>
          {!canContinue && (
            <p className="text-center text-sm text-ink-muted sm:text-right">
              {busy ? "Waiting for uploads to finish…" : hasErrors ? "Remove or replace files with problems." : "Add at least one file."}
            </p>
          )}
        </div>
      </ActionBar>
    </Container>
  );
}

function FileRow({ file }: { file: DraftFile }) {
  const flow = usePrintFlow();
  const replaceRef = useRef<HTMLInputElement>(null);
  const busy = file.status === "uploading" || file.status === "verifying";

  return (
    <li
      className={clsx("rounded-2xl border-2 bg-white p-3 sm:p-4", file.status === "error" ? "border-danger/40" : "border-transparent shadow-[var(--shadow-card)]")}
      data-testid="file-row"
      data-status={file.status}
    >
      <div className="flex gap-3 sm:gap-4">
        <FileThumb file={file} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" title={file.name}>{file.name}</p>
          <p className="text-sm text-ink-muted">
            {[file.format, formatBytes(file.sizeBytes), file.pageCount ? `${file.pageCount} page${file.pageCount === 1 ? "" : "s"}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {busy && (
            <div className="mt-2" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={file.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${file.name}`}>
                <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${file.progress}%` }} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                {file.status === "uploading" ? `Uploading… ${file.progress}%` : "Checking file…"}
              </p>
            </div>
          )}
          {file.status === "ready" && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-green">
              <CircleCheck className="h-4 w-4" aria-hidden="true" /> Ready to print
            </p>
          )}
          {file.status === "error" && (
            <p className="mt-1 text-sm font-medium text-danger" role="alert">{file.error}</p>
          )}
        </div>
      </div>
      {!busy && (
        <div className="mt-3 flex gap-2 border-t border-line pt-3">
          <Button variant="ghost" className="min-h-11 flex-1 px-3 sm:flex-none" onClick={() => replaceRef.current?.click()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Replace
          </Button>
          <Button variant="ghost" className="min-h-11 flex-1 px-3 text-danger hover:bg-danger-50 sm:flex-none" onClick={() => flow.removeFile(file.localId)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
          </Button>
          <input
            ref={replaceRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            aria-label={`Replace ${file.name}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) flow.replaceFile(file.localId, f);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </li>
  );
}
