"use client";

import type { KioskOrder, PrintJob } from "@/lib/kiosk/types";

export class KioskApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/kiosk/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new KioskApiError("OFFLINE", "The kiosk can't reach the server. Please try again in a moment.", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && body?.error?.code === "KIOSK_NOT_PAIRED") window.location.replace("/kiosk/setup");
    throw new KioskApiError(body?.error?.code ?? "INTERNAL_ERROR", body?.error?.message ?? "Something went wrong.", res.status);
  }
  return body as T;
}

const post = <T,>(path: string, data?: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) });

export const kioskApi = {
  status: () => call<{ kioskId: string; online: boolean }>("/status"),
  lookup: (code: string) => post<{ order: KioskOrder }>("/lookup", { code }).then((r) => r.order),
  activeJob: () => call<{ order: KioskOrder | null }>("/active-job").then((r) => r.order),
  claim: (orderId: string, code: string) => post<{ order: KioskOrder }>(`/orders/${orderId}/claim`, { code }).then((r) => r.order),
  prepare: (orderId: string) => post<{ job: PrintJob }>(`/orders/${orderId}/prepare`).then((r) => r.job),
  complete: (orderId: string) => post(`/orders/${orderId}/complete`),
  fail: (orderId: string, reason: string, retryable: boolean) => post(`/orders/${orderId}/fail`, { reason, retryable }),
  /** The print-ready PDF bytes (for the on-screen preview). */
  file: async (orderId: string): Promise<ArrayBuffer | null> => {
    try {
      const res = await fetch(`/kiosk/api/orders/${orderId}/file`, { cache: "no-store" });
      return res.ok ? await res.arrayBuffer() : null;
    } catch {
      return null;
    }
  },
};
