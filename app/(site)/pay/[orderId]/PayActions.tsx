"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { Alert, Button } from "@/components/ui";

export function PayActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "paying" | "cancelling">("idle");
  const [error, setError] = useState<string | null>(null);

  async function post(path: string) {
    const res = await fetch(`/api/orders/${orderId}/${path}`, { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error?.message ?? "Something went wrong. Please try again.");
    return body;
  }

  async function pay() {
    setState("paying");
    setError(null);
    try {
      await post("pay");
      router.replace(`/order/${orderId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed. Please try again.");
      setState("idle");
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this order? Your files will be deleted.")) return;
    setState("cancelling");
    try {
      await post("cancel");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the order.");
      setState("idle");
    }
  }

  return (
    <div className="mt-6">
      {error && <Alert tone="error" className="mb-4" title={error} />}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button variant="success" size="lg" className="w-full px-4 text-base sm:text-lg" onClick={pay} disabled={state !== "idle"}>
          {state === "paying" ? (
            <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
          ) : (
            <CircleCheck className="h-6 w-6" aria-hidden="true" />
          )}
          SIMULATE SUCCESSFUL PAYMENT
        </Button>
      </div>
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={cancel}
          disabled={state !== "idle"}
          className="min-h-11 rounded-xl px-4 font-semibold text-ink-muted underline-offset-4 hover:text-danger hover:underline"
        >
          Cancel order
        </button>
      </div>
    </div>
  );
}
