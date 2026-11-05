"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CollectionCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const pretty = `${code.slice(0, 2)} ${code.slice(2, 5)} ${code.slice(5)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback for older browsers / non-secure contexts.
      const el = document.createElement("textarea");
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="rounded-[var(--radius-card)] bg-navy p-6 text-center text-white shadow-[var(--shadow-lift)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Your collection code</p>
      <p
        className="mt-2 select-all whitespace-nowrap font-mono text-[2.5rem] font-bold tracking-[0.1em] sm:text-6xl"
        data-testid="collection-code"
        data-code={code}
        aria-label={`Collection code ${code.split("").join(" ")}`}
      >
        {pretty}
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-5 font-semibold text-navy hover:bg-brand-50"
      >
        {copied ? <Check className="h-5 w-5 text-green" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
        {copied ? "Copied!" : "Copy code"}
      </button>
      <p className="mt-3 text-sm text-white/70" aria-live="polite">
        Tip: take a screenshot so you have the code when you reach the kiosk.
      </p>
    </div>
  );
}
