"use client";

import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MonitorCog } from "lucide-react";
import { Logo } from "@/components/Logo";

/** Big kiosk button. Size follows the screen (see .kiosk tokens in globals.css). */
export function KButton({
  tone = "primary",
  className,
  ...props
}: React.ComponentProps<"button"> & { tone?: "primary" | "secondary" | "success" | "ghost" }) {
  return (
    <button
      type="button"
      className={twMerge(clsx(
        "inline-flex min-h-[var(--k-btn-h)] items-center justify-center gap-[0.5em] rounded-[var(--k-radius)] px-[1.4em] text-[length:var(--k-btn)] font-bold transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:size-[1.2em] [&>svg]:shrink-0",
        tone === "primary" && "bg-brand text-white shadow-[0_10px_24px_rgb(8_119_249/0.3)]",
        tone === "success" && "bg-green text-white shadow-[0_10px_24px_rgb(21_148_71/0.3)]",
        tone === "secondary" && "border-[3px] border-line bg-white text-navy",
        tone === "ghost" && "text-brand",
        className,
      ))}
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
    <span className="hidden font-display text-[length:var(--k-body)] font-bold tabular-nums sm:inline">
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
  // Laptops: Ctrl + Alt + K also opens the staff menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.ctrlKey && e.altKey && (e.code === "KeyK" || e.key.toLowerCase() === "k") && onStaff();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStaff]);
  return (
    <header className="flex h-[var(--k-header-h)] shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-[var(--k-pad)]">
      <div
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onContextMenu={(e) => e.preventDefault()}
        className="origin-left sm:scale-110 lg:scale-125"
        data-testid="kiosk-logo"
      >
        <Logo />
      </div>
      <div className="flex items-center gap-[var(--k-gap)] text-[length:var(--k-small)]">
        {offline && (
          <span className="rounded-full bg-danger-50 px-[1em] py-[0.4em] font-bold text-danger" role="status">
            Offline · reconnecting…
          </span>
        )}
        <span className="flex items-center gap-[0.4em] rounded-full bg-warning-50 px-[1em] py-[0.4em] font-bold text-warning" data-testid="simulation-badge">
          <MonitorCog className="size-[1.2em]" aria-hidden="true" /> Simulation<span className="hidden md:inline"> mode · no printer</span>
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
      <h1 className="text-[length:var(--k-h1)] font-extrabold">{title}</h1>
      {subtitle && <p className="mt-[0.4em] text-[length:var(--k-body)] text-ink-muted">{subtitle}</p>}
    </div>
  );
}
