"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LoaderCircle, MonitorSmartphone } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Alert, Button } from "@/components/ui";

/** Staff-only: pair this device as a PRINTNOW kiosk (once). */
export function SetupForm({ pairedAs }: { pairedAs: string | null }) {
  const router = useRouter();
  const [kioskId, setKioskId] = useState("kiosk-01");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pair(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/kiosk/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kioskId, key }),
    }).catch(() => null);
    if (res?.ok) {
      router.push("/kiosk");
      router.refresh();
      return;
    }
    const body = await res?.json().catch(() => null);
    setError(body?.error?.message ?? "Could not reach the server. Check the internet connection.");
    setBusy(false);
  }

  async function unpair() {
    await fetch("/kiosk/api/unpair", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="w-full max-w-xl select-text rounded-[2rem] bg-white p-8 shadow-[var(--shadow-lift)] sm:p-10">
      <Logo />
      <h1 className="mt-6 flex items-center gap-3 text-3xl font-extrabold">
        <MonitorSmartphone className="h-8 w-8 text-brand" aria-hidden="true" /> Kiosk setup
      </h1>
      <p className="mt-2 text-lg text-ink-muted">For PRINTNOW staff. Pair this device once with its kiosk ID and key.</p>

      {pairedAs && (
        <Alert tone="success" className="mt-6" title={`This device is paired as “${pairedAs}”.`}>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button onClick={() => router.push("/kiosk")}>Open kiosk</Button>
            <Button variant="secondary" onClick={unpair}>Unpair this device</Button>
          </div>
        </Alert>
      )}

      <form onSubmit={pair} className="mt-6 space-y-4">
        <div>
          <label htmlFor="kiosk-id" className="mb-1 block font-semibold">Kiosk ID</label>
          <input
            id="kiosk-id"
            value={kioskId}
            onChange={(e) => setKioskId(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            className="h-14 w-full rounded-2xl border-2 border-line px-4 text-lg focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="kiosk-key" className="mb-1 block font-semibold">Kiosk key</label>
          <input
            id="kiosk-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            className="h-14 w-full rounded-2xl border-2 border-line px-4 font-mono text-lg focus:border-brand focus:outline-none"
          />
        </div>
        {error && <Alert tone="error" title={error} />}
        <Button type="submit" size="lg" className="w-full" disabled={busy || !kioskId || !key}>
          {busy ? <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" /> : <KeyRound className="h-6 w-6" aria-hidden="true" />}
          Pair this device
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        The key is checked by the server and is not stored in this browser; the device receives a secure session instead.
      </p>
    </div>
  );
}
