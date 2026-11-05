"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MonitorCog } from "lucide-react";
import { Logo } from "@/components/Logo";

/** Big touch button for the kiosk (≥ 80 px tall). */
export function KButton({
  tone = "primary",
  className,
  ...props
}: React.ComponentProps<"button"> & { tone?: "primary" | "secondary" | "success" | "ghost" }) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex min-h-20 items-center justify-center gap-3 rounded-3xl px-8 text-2xl font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        tone === "primary" && "bg-brand text-white shadow-[0_10px_24px_rgb(8_119_249/0.3)]",
        tone === "success" && "bg-green text-white shadow-[0_10px_24px_rgb(21_148_71/0.3)]",
        tone === "secondary" && "border-[3px] border-line bg-white text-navy",
        tone === "ghost" && "text-brand",
        className,
      )}
      {...props}
    />
  );
}

function subscribeMinute(cb: () => void) {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
}

function Clock() {
  const minute = useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / 60_000), () => 0);
  if (!minute) return null;
  const d = new Date(minute * 60_000);
  return (
    <span className="font-display text-2xl font-bold tabular-nums">
      {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

/** Kiosk top bar. Holding the logo for 2 seconds opens the staff menu. */
export function KioskHeader({ onStaff, offline }: { onStaff: () => void; offline: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    timer.current = setTimeout(onStaff, 2000);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <header className="flex h-24 shrink-0 items-center justify-between border-b border-line bg-white px-8">
      <div
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onContextMenu={(e) => e.preventDefault()}
        className="scale-125 origin-left"
        data-testid="kiosk-logo"
      >
        <Logo />
      </div>
      <div className="flex items-center gap-5">
        {offline && (
          <span className="rounded-full bg-danger-50 px-4 py-2 text-lg font-bold text-danger" role="status">
            Offline · reconnecting…
          </span>
        )}
        <span className="flex items-center gap-2 rounded-full bg-warning-50 px-4 py-2 text-lg font-bold text-warning" data-testid="simulation-badge">
          <MonitorCog className="h-5 w-5" aria-hidden="true" /> Simulation mode · no printer
        </span>
        <Clock />
      </div>
    </header>
  );
}

/** Seconds until the kiosk returns home when nobody touches it. Null when inactive. */
export function useIdleTimer(active: boolean, seconds: number, onIdle: () => void): number | null {
  const [left, setLeft] = useState<number | null>(null);
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const reset = () => {
      last = Date.now();
      setLeft(null);
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const t = setInterval(() => {
      const remaining = seconds - (Date.now() - last) / 1000;
      if (remaining <= 0) {
        setLeft(null);
        onIdleRef.current();
        last = Date.now();
      } else {
        setLeft(remaining <= 10 ? Math.ceil(remaining) : null);
      }
    }, 250);
    return () => {
      clearInterval(t);
      events.forEach((e) => window.removeEventListener(e, reset));
      setLeft(null);
    };
  }, [active, seconds]);
  return active ? left : null;
}

/** Keeps the iPad screen on while the kiosk is open (where supported). */
export function useWakeLock() {
  useEffect(() => {
    type WakeLockNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    const acquire = () => {
      if (document.visibilityState === "visible") nav.wakeLock!.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, []);
}

export function ScreenTitle({ title, subtitle, className }: { title: React.ReactNode; subtitle?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h1 className="text-5xl font-extrabold">{title}</h1>
      {subtitle && <p className="mt-3 text-2xl text-ink-muted">{subtitle}</p>}
    </div>
  );
}
