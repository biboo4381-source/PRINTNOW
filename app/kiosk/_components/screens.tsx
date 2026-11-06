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

/*
 * All sizes use the fluid .kiosk tokens (globals.css), so each screen fits laptops (1280×720 and up),
 * tablets and large touchscreens. Below the md breakpoint, layouts stack and the page may scroll.
 */
const screen = "flex flex-1 flex-col gap-[var(--k-gap)] p-[var(--k-pad)]";
const card = "rounded-[var(--k-radius)] bg-white shadow-[var(--shadow-card)]";
const centered = "flex flex-1 flex-col items-center justify-center gap-[var(--k-gap)] p-[var(--k-pad)] text-center";
const bigIcon = "flex size-[var(--k-icon-box)] shrink-0 items-center justify-center rounded-full [&>svg]:size-[55%]";

// ─── Home ─────────────────────────────────────────────────────────────────

export function HomeScreen({ onUpload, onCode }: { onUpload: () => void; onCode: () => void }) {
  const tile =
    "flex min-h-[clamp(12rem,42vh,22rem)] flex-col items-center justify-center gap-[0.6em] rounded-[calc(var(--k-radius)*1.3)] p-[var(--k-pad)] text-center text-[length:var(--k-body)] ring-4 ring-transparent transition hover:-translate-y-0.5 active:scale-[0.99]";
  const tileIcon = "flex size-[var(--k-icon-box)] items-center justify-center rounded-[var(--k-radius)] [&>svg]:size-[55%]";
  return (
    <div className={twMerge(screen, "justify-center")}>
      <div className="text-center">
        <h1 className="text-[length:var(--k-h-hero)] font-extrabold">Welcome to PRINTNOW</h1>
        <p className="mt-[0.3em] text-[length:var(--k-body)] text-ink-muted">What would you like to do?</p>
      </div>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-[var(--k-gap)] md:grid-cols-2">
        <button type="button" onClick={onUpload} className={clsx(tile, "bg-white shadow-[var(--shadow-lift)] active:ring-brand")}>
          <span className={clsx(tileIcon, "bg-brand-50 text-brand")}>
            <Upload aria-hidden="true" />
          </span>
          <span className="font-display text-[length:var(--k-tile)] font-extrabold tracking-tight">UPLOAD FILE</span>
          <span className="max-w-md text-ink-muted">Scan a QR code and send a document from your phone</span>
        </button>
        <button
          type="button"
          onClick={onCode}
          className={clsx(tile, "bg-brand text-white shadow-[0_18px_40px_rgb(8_119_249/0.35)] active:ring-navy")}
        >
          <span className={clsx(tileIcon, "bg-white/15")}>
            <KeyRound aria-hidden="true" />
          </span>
          <span className="font-display text-[length:var(--k-tile)] font-extrabold tracking-tight">COLLECTION CODE</span>
          <span className="max-w-md text-white/85">Already paid? Enter your code to print</span>
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
    { icon: KeyRound, text: "Come back and choose COLLECTION CODE" },
  ];
  return (
    <div className={screen}>
      <ScreenTitle title="Upload a file from your phone" subtitle="No app or account needed." />
      <div className="grid flex-1 grid-cols-1 items-center gap-[var(--k-gap)] md:grid-cols-[auto_1fr]">
        <div className={clsx(card, "mx-auto flex flex-col items-center p-[var(--k-pad)] shadow-[var(--shadow-lift)]")}>
          <div
            className="size-[var(--k-qr)] [&>svg]:h-full [&>svg]:w-full"
            data-testid="upload-qr"
            role="img"
            aria-label={`QR code linking to ${uploadUrl}`}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-[0.6em] flex items-center gap-[0.4em] font-mono text-[length:var(--k-small)] font-semibold text-brand">
            <QrCode className="size-[1.2em]" aria-hidden="true" />
            {uploadUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>
        <ol className="space-y-[var(--k-gap)]">
          {steps.map((s, i) => (
            <li key={s.text} className={clsx(card, "flex items-center gap-[0.8em] p-[calc(var(--k-pad)*0.6)] text-[length:var(--k-body)]")}>
              <span className="flex size-[2.6em] shrink-0 items-center justify-center rounded-[0.6em] bg-brand-50 text-brand">
                <s.icon className="size-[1.3em]" aria-hidden="true" />
              </span>
              <span className="font-semibold leading-snug">
                <span className="text-brand">{i + 1}.</span> {s.text}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <KButton tone="secondary" onClick={onHome}>
          <Home aria-hidden="true" /> Back to home
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

  // Laptops and desktops: type the digits, Backspace, Escape to clear, Enter to confirm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") onChange(digits.slice(0, -1));
      else if (e.key === "Escape") onChange("");
      else if (e.key === "Enter" && complete) onSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const key =
    "flex h-[var(--k-key)] items-center justify-center rounded-[var(--k-radius)] bg-white text-[length:var(--k-key-text)] font-bold shadow-[var(--shadow-card)] transition hover:bg-brand-50 active:scale-95 active:bg-brand-50";

  return (
    <div className={twMerge(screen, "grid flex-1 grid-cols-1 items-center lg:grid-cols-[1fr_auto]")}>
      <div className="space-y-[var(--k-gap)]">
        <ScreenTitle
          title="Enter your collection code"
          subtitle={
            <>
              You received it after paying on the PRINTNOW website.
              <span className="hidden lg:inline"> You can also type it on the keyboard.</span>
            </>
          }
        />
        <div
          className="flex flex-wrap items-center gap-[calc(var(--k-gap)*0.5)]"
          aria-live="polite"
          aria-label={`Code PN ${digits.split("").join(" ")}`}
          data-testid="code-display"
        >
          <span className="flex h-[var(--k-digit-h)] items-center rounded-[var(--k-radius)] bg-navy px-[0.45em] font-mono text-[length:var(--k-digit-text)] font-bold text-white">
            PN
          </span>
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={clsx(
                "flex h-[var(--k-digit-h)] w-[var(--k-digit-w)] items-center justify-center rounded-[var(--k-radius)] border-[3px] bg-white font-mono text-[length:var(--k-digit-text)] font-bold",
                i === digits.length ? "border-brand" : "border-line",
                i === 2 && "mr-[calc(var(--k-gap)*0.5)]",
              )}
            >
              {digits[i] ?? ""}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-[var(--k-gap)]">
          <KButton tone="secondary" onClick={onHome}>
            <ArrowLeft aria-hidden="true" /> Home
          </KButton>
          <KButton tone="success" className="min-w-[11em]" disabled={!complete} onClick={onSubmit}>
            Confirm code
          </KButton>
        </div>
      </div>
      <div
        className="mx-auto grid w-full max-w-[calc(var(--k-key)*4.6)] grid-cols-3 gap-[calc(var(--k-gap)*0.6)] lg:w-[calc(var(--k-key)*4.6)]"
        role="group"
        aria-label="Keypad"
      >
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)} aria-label={d}>
            {d}
          </button>
        ))}
        <button type="button" className={twMerge(key, "text-[length:var(--k-btn)] text-danger")} onClick={() => onChange("")} aria-label="Clear">
          Clear
        </button>
        <button type="button" className={key} onClick={() => press("0")} aria-label="0">
          0
        </button>
        <button type="button" className={twMerge(key, "text-navy")} onClick={() => onChange(digits.slice(0, -1))} aria-label="Delete">
          <Delete className="size-[0.9em]" aria-hidden="true" />
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
    <div className={centered} data-testid="kiosk-message" data-code={code}>
      <span
        className={clsx(
          bigIcon,
          m.tone === "info" && "bg-brand-50 text-brand",
          m.tone === "warning" && "bg-warning-50 text-warning",
          m.tone === "error" && "bg-danger-50 text-danger",
        )}
      >
        <Icon aria-hidden="true" />
      </span>
      <div role="alert">
        <h1 className="text-[length:var(--k-h1)] font-extrabold">{m.title}</h1>
        <p className="mx-auto mt-[0.4em] max-w-3xl text-[length:var(--k-body)] text-ink-muted">{m.text}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-[var(--k-gap)]">
        {m.retry && (
          <KButton onClick={onRetry} className="min-w-[10em]">
            Try again
          </KButton>
        )}
        <KButton tone="secondary" onClick={onHome} className="min-w-[10em]">
          <Home aria-hidden="true" /> Home
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
    <div className={screen} data-testid="kiosk-confirm">
      <ScreenTitle title="Is this your order?" subtitle="Check the details, then press CONFIRM & PRINT." />
      <div className="grid flex-1 grid-cols-1 gap-[var(--k-gap)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className={clsx(card, "flex flex-col p-[var(--k-pad)] text-[length:var(--k-small)]")}>
          <span className="flex size-[calc(var(--k-icon-box)*0.75)] items-center justify-center rounded-[var(--k-radius)] bg-brand-50 text-brand [&>svg]:size-1/2">
            <Icon aria-hidden="true" />
          </span>
          <p className="mt-[1em] font-semibold text-ink-muted">Document</p>
          <p className="mt-[0.2em] text-[length:var(--k-h1)] font-bold leading-tight [font-size:calc(var(--k-h1)*0.7)] [overflow-wrap:anywhere]" data-testid="confirm-name">
            {f.name}
          </p>
          <div className="mt-[0.8em] flex flex-wrap gap-[0.5em]">
            <span className="rounded-full bg-surface px-[0.9em] py-[0.35em] font-semibold">Format: {f.format}</span>
            <span className="rounded-full bg-surface px-[0.9em] py-[0.35em] font-semibold">
              {f.pageCount} page{f.pageCount === 1 ? "" : "s"} in document
            </span>
          </div>
          <div className="mt-auto pt-[1em] text-ink-muted">
            <p>
              Code <span className="font-mono font-bold text-navy">{prefix} {a} {b}</span>
            </p>
            <p>
              Order <span className="font-mono font-bold text-navy">{order.orderRef}</span>
            </p>
          </div>
        </div>
        <dl className={clsx(card, "divide-y divide-line px-[var(--k-pad)] py-[calc(var(--k-pad)*0.4)]")} data-testid="confirm-details">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-[1em] py-[clamp(0.45rem,1.4vmin,1rem)]">
              <dt className="text-[length:var(--k-small)] text-ink-muted">{k}</dt>
              <dd className="text-right text-[length:var(--k-body)] font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-col-reverse justify-between gap-[var(--k-gap)] sm:flex-row">
        <KButton tone="secondary" onClick={onCancel} className="min-w-[10em]">
          <ArrowLeft aria-hidden="true" /> CANCEL / BACK
        </KButton>
        <KButton tone="success" onClick={onConfirm} className="min-w-[12em] text-[length:calc(var(--k-btn)*1.15)]">
          <Printer aria-hidden="true" /> CONFIRM &amp; PRINT
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
    <div className={centered} data-testid="kiosk-done">
      <span className={clsx(bigIcon, "bg-green-50 text-green")}>
        <CircleCheckBig aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-[length:var(--k-h-hero)] font-extrabold">Printing complete</h1>
        <p className="mt-[0.4em] text-[length:var(--k-body)] text-ink-muted">
          Please collect your documents. {job.totalSheets} sheet{job.totalSheets === 1 ? "" : "s"} · order {job.orderRef}
        </p>
        <p className="mt-[0.5em] text-[length:var(--k-small)] font-semibold text-warning">
          Simulated print. This prototype has no printer, so no paper was produced.
        </p>
      </div>
      <KButton onClick={onHome} className="min-w-[10em]">
        <Home aria-hidden="true" /> Done ({Math.max(0, left)})
      </KButton>
    </div>
  );
}

export function FailedScreen({ retryable, reference, detail, onHome }: { retryable: boolean; reference?: string; detail?: string; onHome: () => void }) {
  return (
    <div className={centered} data-testid="kiosk-failed">
      <span className={clsx(bigIcon, "bg-danger-50 text-danger")}>
        <TriangleAlert aria-hidden="true" />
      </span>
      <div role="alert">
        <h1 className="text-[length:var(--k-h1)] font-extrabold">Printing stopped</h1>
        <p className="mx-auto mt-[0.4em] max-w-3xl text-[length:var(--k-body)] text-ink-muted">
          {retryable
            ? "Something went wrong with the printer. Your code still works, so you can try again or ask staff for help."
            : `This order can't be printed. Please contact PRINTNOW support${reference ? ` with reference ${reference}` : ""}.`}
        </p>
        {detail && (
          <p className="mx-auto mt-[0.8em] max-w-3xl font-mono text-[length:var(--k-small)] text-ink-muted/80 [overflow-wrap:anywhere]" data-testid="failure-detail">
            Details for staff{reference ? ` · ${reference}` : ""}: {detail}
          </p>
        )}
      </div>
      <KButton tone="secondary" onClick={onHome} className="min-w-[10em]">
        <Home aria-hidden="true" /> Home
      </KButton>
    </div>
  );
}

export function RecoveryScreen({ order, onRelease, onComplete }: { order: KioskOrder; onRelease: () => void; onComplete: () => void }) {
  return (
    <div className={centered} data-testid="kiosk-recovery">
      <span className={clsx(bigIcon, "bg-warning-50 text-warning")}>
        <Clock3 aria-hidden="true" />
      </span>
      <div>
        <p className="text-[length:var(--k-small)] font-bold uppercase tracking-widest text-warning">Staff action needed</p>
        <h1 className="mt-[0.2em] text-[length:var(--k-h1)] font-extrabold">Unfinished print found</h1>
        <p className="mx-auto mt-[0.4em] max-w-3xl text-[length:var(--k-body)] text-ink-muted">
          Order <span className="font-mono font-bold text-navy">{order.orderRef}</span> ({order.files[0]?.name}) was being printed when the
          kiosk stopped. Release it so the customer can use the same code again, or mark it as printed if the pages came out.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-[var(--k-gap)]">
        <KButton onClick={onRelease} className="min-w-[10em]">Release order</KButton>
        <KButton tone="secondary" onClick={onComplete} className="min-w-[10em]">Mark as printed</KButton>
      </div>
    </div>
  );
}
