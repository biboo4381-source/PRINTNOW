"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePrintFlow } from "../PrintFlowProvider";

/** Loads the customer's chosen image (kept in this browser) as a decoded <img>. */
export function useSourceImage() {
  const flow = usePrintFlow();
  const [state, setState] = useState<{ img: HTMLImageElement | null; status: "loading" | "ready" | "missing" }>({
    img: null,
    status: "loading",
  });
  const fileId = flow.file?.fileId;
  const { getSource } = flow;

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    getSource().then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setState({ img: null, status: "missing" });
        return;
      }
      url = URL.createObjectURL(blob);
      const el = new Image();
      el.decoding = "async";
      el.onload = () => !cancelled && setState({ img: el, status: "ready" });
      el.onerror = () => !cancelled && setState({ img: null, status: "missing" });
      el.src = url;
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [getSource, fileId]);

  return state;
}

/** Width of an element, kept up to date. */
export function useElementWidth<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

/** Current window height (falls back to a typical phone height during server rendering). */
export function useViewportHeight(fallback = 800) {
  return useSyncExternalStore(subscribeResize, () => window.innerHeight, () => fallback);
}
