"use client";

import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CircleAlert,
  CircleCheckBig,
  Clock3,
  Delete,
  FileText,
  Home,
  ImageIcon,
  KeyRound,
  Printer,
  QrCode,
  ScanLine,
  Smartphone,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { formatCollectionCodeParts } from "./format";
import type { KioskOrder, PrintJob } from "@/lib/kiosk/types";
import { formatRupiah } from "@/lib/pricing";
import { KButton, ScreenTitle } from "./ui";

// ─── Home ─────────────────────────────────────────────────────────────────

export function HomeScreen({ onUpload, onCode }: { onUpload: () => void; onCode: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-10 px-12 py-10">
      <div className="text-center">
        <h1 className="text-6xl font-extrabold">Welcome to PRINTNOW</h1>
        <p className="mt-4 text-3xl text-ink-muted">What would you like to do?</p>
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <button
          type="button"
          onClick={onUpload}
          className="group flex min-h-[22rem] flex-col items-center justify-center gap-6 rounded-[2.5rem] bg-white p-10 text-center shadow-[var(--shadow-lift)] ring-4 ring-transparent transition active:scale-[0.99] active:ring-brand"
        >
          <span className="flex h-36 w-36 items-center justify-center rounded-[2rem] bg-brand-50 text-brand">
            <Upload className="h-20 w-20" aria-hidden="true" />
          </span>
          <span className="font-display text-5xl font-extrabold tracking-tight">UPLOAD FILE</span>
          <span className="max-w-md text-2xl text-ink-muted">Scan a QR code and send a document from your phone</span>
        </button>
        <button
          type="button"
          onClick={onCode}
          className="group flex min-h-[22rem] flex-col items-center justify-center gap-6 rounded-[2.5rem] bg-brand p-10 text-center text-white shadow-[0_18px_40px_rgb(8_119_249/0.35)] ring-4 ring-transparent transition active:scale-[0.99] active:ring-navy"
        >
          <span className="flex h-36 w-36 items-center justify-center rounded-[2rem] bg-white/15">
            <KeyRound className="h-20 w-20" aria-hidden="true" />
          </span>
          <span className="font-display text-5xl font-extrabold tracking-tight">COLLECTION CODE</span>
          <span className="max-w-md text-2xl text-white/85">Already paid? Enter your code to print</span>
        </button>
      </div>
    </div>
  );
}

// ─── Upload (QR) ──────────────────────────────────────────────────────────

export function UploadScreen({ qrSvg, uploadUrl, onHome }: { qrSvg: string; uploadUrl: string; onHome: () => void }) {
  const steps = [
    { icon: ScanLine, text: "Scan the QR code with your phone camera" },
    { icon: Smartphone, text: "Upload your document, choose settings and pay" },
    { icon: KeyRound, text: "Come back and tap COLLECTION CODE" },
  ];
  return (
    <div className="flex flex-1 flex-col gap-8 px-12 py-10">
      <ScreenTitle title="Upload a file from your phone" subtitle="No app or account needed." />
      <div className="grid flex-1 grid-cols-1 items-center gap-10 md:grid-cols-[auto_1fr]">
        <div className="mx-auto flex flex-col items-center rounded-[2.5rem] bg-white p-8 shadow-[var(--shadow-lift)]">
          <div
            className="h-[22rem] w-[22rem] [&>svg]:h-full [&>svg]:w-full"
            data-testid="upload-qr"
            role="img"
            aria-label={`QR code linking to ${uploadUrl}`}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-4 flex items-center gap-2 font-mono text-xl font-semibold text-brand">
            <QrCode className="h-6 w-6" aria-hidden="true" />
            {uploadUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>
        <ol className="space-y-6">
          {steps.map((s, i) => (
            <li key={s.text} className="flex items-center gap-6 rounded-3xl bg-white p-6 shadow-[var(--shadow-card)]">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand">
                <s.icon className="h-10 w-10" aria-hidden="true" />
              </span>
              <span className="text-3xl font-semibold leading-snug">
                <span className="text-brand">{i + 1}.</span> {s.text}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <KButton tone="secondary" onClick={onHome}>
          <Home className="h-8 w-8" aria-hidden="true" /> Back to home
        </KButton>
      </div>
    </div>
  );
}

// ─── Collection code keypad ───────────────────────────────────────────────

export function CodeScreen({
  digits,
  onChange,
  onSubmit,
  onHome,
}: {
  digits: string;
  onChange: (d: string) => void;
  onSubmit: () => void;
  onHome: () => void;
}) {
  const complete = digits.length === 6;
  const press = (d: string) => digits.length < 6 && onChange(digits + d);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") onChange(digits.slice(0, -1));
      else if (e.key === "Escape") onChange("");
      else if (e.key === "Enter" && complete) onSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const key = "flex h-24 items-center justify-center rounded-3xl bg-white text-5xl font-bold shadow-[var(--shadow-card)] transition active:scale-95 active:bg-brand-50";

  return (
    <div className="grid flex-1 grid-cols-1 items-center gap-12 px-12 py-8 md:grid-cols-[1fr_auto]">
      <div className="space-y-8">
        <ScreenTitle title="Enter your collection code" subtitle="You received it after paying on the PRINTNOW website." />
        <div className="flex items-center gap-3" aria-live="polite" aria-label={`Code PN ${digits.split("").join(" ")}`} data-testid="code-display">
          <span className="flex h-28 items-center rounded-3xl bg-navy px-6 font-mono text-5xl font-bold text-white">PN</span>
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={clsx(
                "flex h-28 w-20 items-center justify-center rounded-3xl border-[3px] bg-white font-mono text-6xl font-bold",
                i === digits.length ? "border-brand" : "border-line",
                i === 2 && "mr-3",
              )}
            >
              {digits[i] ?? ""}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <KButton tone="secondary" onClick={onHome}>
            <ArrowLeft className="h-8 w-8" aria-hidden="true" /> Home
          </KButton>
          <KButton tone="success" className="min-w-80" disabled={!complete} onClick={onSubmit}>
            Confirm code
          </KButton>
        </div>
      </div>
      <div className="grid w-[26rem] grid-cols-3 gap-4" role="group" aria-label="Keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)} aria-label={d}>
            {d}
          </button>
        ))}
        <button type="button" className={twMerge(clsx(key, "text-3xl text-danger"))} onClick={() => onChange("")} aria-label="Clear">
          Clear
        </button>
        <button type="button" className={key} onClick={() => press("0")} aria-label="0">
          0
        </button>
        <button type="button" className={twMerge(clsx(key, "text-navy"))} onClick={() => onChange(digits.slice(0, -1))} aria-label="Delete">
          <Delete className="h-12 w-12" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─── Messages ─────────────────────────────────────────────────────────────

const MESSAGES: Record<string, { title: string; text: string; tone: "warning" | "error" | "info"; retry: boolean }> = {
  INVALID_CODE: {
    title: "Code not found",
    text: "We couldn't find a paid order with this code. Please check the 6 digits and try again.",
    tone: "warning",
    retry: true,
  },
  ALREADY_PROCESSING: { title: "Already being printed", text: "This order is being printed at a kiosk right now.", tone: "info", retry: false },
  ALREADY_COMPLETED: { title: "Already printed", text: "This order has already been printed and collected. Each code can be used once.", tone: "info", retry: false },
  EXPIRED: { title: "Code expired", text: "This code is no longer valid. Paid orders must be collected within 7 days.", tone: "warning", retry: false },
  CANCELLED: { title: "Order cancelled", text: "This order was cancelled and can't be printed.", tone: "warning", retry: false },
  ORDER_FAILED: { title: "Order can't be printed", text: "Please contact PRINTNOW support with your order reference.", tone: "error", retry: false },
  NOT_PAID: { title: "Not paid yet", text: "This order hasn't been paid. Please finish payment on the website first.", tone: "warning", retry: false },
  RATE_LIMITED: { title: "Too many attempts", text: "Please wait a few minutes before trying again.", tone: "warning", retry: false },
  OFFLINE: { title: "Kiosk offline", text: "The kiosk can't reach PRINTNOW right now. Please try again in a moment.", tone: "error", retry: true },
  PRINT_FILE_INVALID: { title: "Document problem", text: "This document couldn't be prepared for printing. Please contact PRINTNOW support with your order reference.", tone: "error", retry: false },
  NOT_CLAIMED: { title: "Order not available", text: "This order is no longer available at this kiosk.", tone: "warning", retry: false },
};

export function MessageScreen({ code, onRetry, onHome }: { code: string; onRetry: () => void; onHome: () => void }) {
  const m = MESSAGES[code] ?? { title: "Something went wrong", text: "Please try again. If it keeps happening, ask PRINTNOW staff for help.", tone: "error" as const, retry: true };
  const Icon = m.tone === "info" ? CircleAlert : m.tone === "warning" ? TriangleAlert : X;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-12 text-center" data-testid="kiosk-message" data-code={code}>
      <span
        className={clsx(
          "flex h-36 w-36 items-center justify-center rounded-full",
          m.tone === "info" && "bg-brand-50 text-brand",
          m.tone === "warning" && "bg-warning-50 text-warning",
          m.tone === "error" && "bg-danger-50 text-danger",
        )}
      >
        <Icon className="h-20 w-20" aria-hidden="true" />
      </span>
      <div role="alert">
        <h1 className="text-5xl font-extrabold">{m.title}</h1>
        <p className="mx-auto mt-4 max-w-3xl text-3xl text-ink-muted">{m.text}</p>
      </div>
      <div className="flex gap-6">
        {m.retry && (
          <KButton onClick={onRetry} className="min-w-72">
            Try again
          </KButton>
        )}
        <KButton tone="secondary" onClick={onHome} className="min-w-72">
          <Home className="h-8 w-8" aria-hidden="true" /> Home
        </KButton>
      </div>
    </div>
  );
}

// ─── Order confirmation ───────────────────────────────────────────────────

export function ConfirmScreen({ order, code, onConfirm, onCancel }: { order: KioskOrder; code: string; onConfirm: () => void; onCancel: () => void }) {
  const f = order.files[0];
  const s = f.settings;
  const isImage = f.format !== "PDF";
  const Icon = isImage ? ImageIcon : FileText;
  const rows: [string, string][] = [
    ["Print mode", s.colorMode === "COLOR" ? "Color" : "Black & White"],
    ["Copies", String(s.copies)],
    ["Selected pages", isImage ? "1 (photo on A4)" : s.pages === "all" ? `All ${f.pageCount}` : s.pages],
    ["Pages per copy", String(s.selectedPageCount)],
    ["Total sheets to print", `${s.printedPages}`],
    ["Paper", "A4, single-sided"],
    ["Paid", formatRupiah(order.totalPrice)],
  ];
  const [prefix, a, b] = formatCollectionCodeParts(code);
  return (
    <div className="flex flex-1 flex-col gap-8 px-12 py-8" data-testid="kiosk-confirm">
      <ScreenTitle title="Is this your order?" subtitle="Check the details, then tap CONFIRM & PRINT." />
      <div className="grid flex-1 grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col rounded-[2rem] bg-white p-8 shadow-[var(--shadow-card)]">
          <span className="flex h-24 w-24 items-center justify-center rounded-3xl bg-brand-50 text-brand">
            <Icon className="h-12 w-12" aria-hidden="true" />
          </span>
          <p className="mt-6 text-xl font-semibold text-ink-muted">Document</p>
          <p className="mt-1 text-3xl font-bold leading-tight [overflow-wrap:anywhere]" data-testid="confirm-name">{f.name}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-xl">
            <span className="rounded-full bg-surface px-4 py-2 font-semibold">Format: {f.format}</span>
            <span className="rounded-full bg-surface px-4 py-2 font-semibold">
              {f.pageCount} page{f.pageCount === 1 ? "" : "s"} in document
            </span>
          </div>
          <div className="mt-auto pt-6 text-xl text-ink-muted">
            <p>
              Code <span className="font-mono font-bold text-navy">{prefix} {a} {b}</span>
            </p>
            <p>
              Order <span className="font-mono font-bold text-navy">{order.orderRef}</span>
            </p>
          </div>
        </div>
        <dl className="divide-y divide-line rounded-[2rem] bg-white px-8 py-4 shadow-[var(--shadow-card)]" data-testid="confirm-details">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-6 py-4">
              <dt className="text-2xl text-ink-muted">{k}</dt>
              <dd className="text-right text-3xl font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex justify-between gap-6">
        <KButton tone="secondary" onClick={onCancel} className="min-w-80">
          <ArrowLeft className="h-8 w-8" aria-hidden="true" /> CANCEL / BACK
        </KButton>
        <KButton tone="success" onClick={onConfirm} className="min-w-[26rem] text-3xl">
          <Printer className="h-9 w-9" aria-hidden="true" /> CONFIRM &amp; PRINT
        </KButton>
      </div>
    </div>
  );
}

// ─── Done / failed / recovery ─────────────────────────────────────────────

export function DoneScreen({ job, onHome, seconds = 12 }: { job: PrintJob; onHome: () => void; seconds?: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) onHome();
  }, [left, onHome]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-12 text-center" data-testid="kiosk-done">
      <span className="flex h-40 w-40 items-center justify-center rounded-full bg-green-50 text-green">
        <CircleCheckBig className="h-24 w-24" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-6xl font-extrabold">Printing complete</h1>
        <p className="mt-4 text-3xl text-ink-muted">
          Please collect your documents. {job.totalSheets} sheet{job.totalSheets === 1 ? "" : "s"} · order {job.orderRef}
        </p>
        <p className="mt-3 text-xl font-semibold text-warning">Simulated print. This prototype has no printer, so no paper was produced.</p>
      </div>
      <KButton onClick={onHome} className="min-w-80">
        <Home className="h-8 w-8" aria-hidden="true" /> Done ({Math.max(0, left)})
      </KButton>
    </div>
  );
}

export function FailedScreen({ retryable, reference, onHome }: { retryable: boolean; reference?: string; onHome: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-12 text-center" data-testid="kiosk-failed">
      <span className="flex h-36 w-36 items-center justify-center rounded-full bg-danger-50 text-danger">
        <TriangleAlert className="h-20 w-20" aria-hidden="true" />
      </span>
      <div role="alert">
        <h1 className="text-5xl font-extrabold">Printing stopped</h1>
        <p className="mx-auto mt-4 max-w-3xl text-3xl text-ink-muted">
          {retryable
            ? "Something went wrong with the printer. Your code still works, so you can try again or ask staff for help."
            : `This order can't be printed. Please contact PRINTNOW support${reference ? ` with reference ${reference}` : ""}.`}
        </p>
      </div>
      <KButton tone="secondary" onClick={onHome} className="min-w-80">
        <Home className="h-8 w-8" aria-hidden="true" /> Home
      </KButton>
    </div>
  );
}

export function RecoveryScreen({ order, onRelease, onComplete }: { order: KioskOrder; onRelease: () => void; onComplete: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-12 text-center" data-testid="kiosk-recovery">
      <span className="flex h-32 w-32 items-center justify-center rounded-full bg-warning-50 text-warning">
        <Clock3 className="h-16 w-16" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xl font-bold uppercase tracking-widest text-warning">Staff action needed</p>
        <h1 className="mt-2 text-5xl font-extrabold">Unfinished print found</h1>
        <p className="mx-auto mt-4 max-w-3xl text-2xl text-ink-muted">
          Order <span className="font-mono font-bold text-navy">{order.orderRef}</span> ({order.files[0]?.name}) was being printed when the
          kiosk stopped. Release it so the customer can use the same code again, or mark it as printed if the pages came out.
        </p>
      </div>
      <div className="flex gap-6">
        <KButton onClick={onRelease} className="min-w-80">Release order</KButton>
        <KButton tone="secondary" onClick={onComplete} className="min-w-80">Mark as printed</KButton>
      </div>
    </div>
  );
}
