"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Wrench, X } from "lucide-react";
import type { KioskOrder, PrintJob } from "@/lib/kiosk/types";
import { KioskApiError, kioskApi } from "./api";
import { type PrintOutcome, PrintingScreen } from "./PrintingScreen";
import { CodeScreen, ConfirmScreen, DoneScreen, FailedScreen, HomeScreen, MessageScreen, RecoveryScreen, UploadScreen } from "./screens";
import { KButton, KioskHeader, useIdleTimer, useWakeLock } from "./ui";

type Screen =
  | { name: "home" }
  | { name: "upload" }
  | { name: "code"; digits: string }
  | { name: "checking"; digits: string }
  | { name: "message"; code: string; digits: string }
  | { name: "confirm"; order: KioskOrder; digits: string }
  | { name: "printing"; order: KioskOrder; digits: string }
  | { name: "done"; job: PrintJob }
  | { name: "failed"; retryable: boolean; reference?: string; detail?: string }
  | { name: "recovery"; order: KioskOrder };

const IDLE_SCREENS = new Set<Screen["name"]>(["upload", "code", "message", "confirm", "failed"]);

export function KioskApp({ kioskId, uploadUrl, qrSvg, idleSeconds }: { kioskId: string; uploadUrl: string; qrSvg: string; idleSeconds: number }) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [offline, setOffline] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [simulateJam, setSimulateJam] = useState(false);
  const home = useCallback(() => setScreen({ name: "home" }), []);

  useWakeLock();
  const idleLeft = useIdleTimer(IDLE_SCREENS.has(screen.name) && !staffOpen, idleSeconds, home);

  // Recovery: did this kiosk stop in the middle of a print?
  useEffect(() => {
    kioskApi
      .activeJob()
      .then((order) => order && setScreen({ name: "recovery", order }))
      .catch(() => undefined);
  }, []);

  // Heartbeat: shows an offline banner and keeps the database warm.
  useEffect(() => {
    const ping = () =>
      kioskApi
        .status()
        .then(() => setOffline(false))
        .catch((e) => setOffline(e instanceof KioskApiError && e.code === "OFFLINE"));
    const t = setInterval(ping, 4 * 60_000);
    window.addEventListener("online", ping);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", ping);
    };
  }, []);

  async function verify(digits: string) {
    setScreen({ name: "checking", digits });
    try {
      const order = await kioskApi.lookup(`PN${digits}`);
      setScreen({ name: "confirm", order, digits });
    } catch (err) {
      setScreen({ name: "message", code: err instanceof KioskApiError ? err.code : "INTERNAL_ERROR", digits });
    }
  }

  const onPrinted = useCallback((o: PrintOutcome) => {
    if (o.ok) setScreen({ name: "done", job: o.job });
    else if (o.kind === "rejected") setScreen({ name: "message", code: o.code, digits: "" });
    else setScreen({ name: "failed", retryable: o.retryable, reference: o.reference, detail: o.detail });
  }, []);

  async function resolveRecovery(order: KioskOrder, action: "release" | "complete") {
    try {
      if (action === "release") await kioskApi.fail(order.orderId, "Kiosk stopped during printing; released by staff", true);
      else await kioskApi.complete(order.orderId);
    } finally {
      home();
    }
  }

  let body: React.ReactNode;
  switch (screen.name) {
    case "home":
      body = <HomeScreen onUpload={() => setScreen({ name: "upload" })} onCode={() => setScreen({ name: "code", digits: "" })} />;
      break;
    case "upload":
      body = <UploadScreen qrSvg={qrSvg} uploadUrl={uploadUrl} onHome={home} />;
      break;
    case "code":
      body = (
        <CodeScreen
          digits={screen.digits}
          onChange={(digits) => setScreen({ name: "code", digits })}
          onSubmit={() => verify(screen.digits)}
          onHome={home}
        />
      );
      break;
    case "checking":
      body = (
        <div className="flex flex-1 flex-col items-center justify-center gap-[var(--k-gap)]" role="status">
          <LoaderCircle className="size-[var(--k-icon-box)] animate-spin text-brand" aria-hidden="true" />
          <p className="text-[length:var(--k-h1)] font-bold">Checking your code…</p>
        </div>
      );
      break;
    case "message":
      body = <MessageScreen code={screen.code} onRetry={() => setScreen({ name: "code", digits: screen.digits })} onHome={home} />;
      break;
    case "confirm":
      body = (
        <ConfirmScreen
          order={screen.order}
          code={`PN${screen.digits}`}
          onCancel={() => setScreen({ name: "code", digits: "" })}
          onConfirm={() => setScreen({ name: "printing", order: screen.order, digits: screen.digits })}
        />
      );
      break;
    case "printing":
      body = <PrintingScreen order={screen.order} code={`PN${screen.digits}`} simulateJam={simulateJam} onFinished={(o) => { setSimulateJam(false); onPrinted(o); }} />;
      break;
    case "done":
      body = <DoneScreen job={screen.job} onHome={home} />;
      break;
    case "failed":
      body = <FailedScreen retryable={screen.retryable} reference={screen.reference} detail={screen.detail} onHome={home} />;
      break;
    case "recovery":
      body = (
        <RecoveryScreen
          order={screen.order}
          onRelease={() => resolveRecovery(screen.order, "release")}
          onComplete={() => resolveRecovery(screen.order, "complete")}
        />
      );
      break;
  }

  return (
    <div className="flex min-h-dvh flex-col" data-testid="kiosk" data-screen={screen.name}>
      <KioskHeader onStaff={() => setStaffOpen(true)} offline={offline} />
      <main className="flex flex-1 flex-col">{body}</main>
      <footer className="flex min-h-[clamp(2.5rem,5.5vmin,3.5rem)] shrink-0 items-center justify-between gap-4 border-t border-line bg-white px-[var(--k-pad)] text-[length:var(--k-small)] text-ink-muted">
        <span>Need help? Please ask PRINTNOW staff.</span>
        {idleLeft !== null ? (
          <span className="font-bold text-warning" role="status">
            Returning to home in {idleLeft}s. Touch the screen to stay.
          </span>
        ) : (
          <span className="hidden sm:inline">Kiosk {kioskId}</span>
        )}
      </footer>

      {staffOpen && (
        <div role="dialog" aria-modal="true" aria-label="Staff menu" className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-6">
          <div className="w-full max-w-lg rounded-[var(--k-radius)] bg-white p-[var(--k-pad)] shadow-[var(--shadow-lift)]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-3 text-[length:var(--k-h1)] font-extrabold">
                <Wrench className="size-[0.9em] text-brand" aria-hidden="true" /> Staff menu
              </h2>
              <button type="button" onClick={() => setStaffOpen(false)} className="flex h-14 w-14 items-center justify-center rounded-2xl hover:bg-surface" aria-label="Close staff menu">
                <X className="h-8 w-8" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 text-[length:var(--k-small)] text-ink-muted">Kiosk {kioskId} · simulated printer · shortcut Ctrl + Alt + K</p>
            <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-surface p-5 text-[length:var(--k-body)] font-semibold">
              Simulate a paper jam on the next print
              <input type="checkbox" className="h-8 w-8 accent-[var(--color-brand)]" checked={simulateJam} onChange={(e) => setSimulateJam(e.target.checked)} />
            </label>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <KButton tone="secondary" className="text-[length:var(--k-small)]" onClick={() => window.location.reload()}>Reload kiosk</KButton>
              <KButton tone="secondary" className="text-[length:var(--k-small)]" onClick={() => router.push("/kiosk/setup")}>Kiosk setup</KButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
