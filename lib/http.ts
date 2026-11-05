import { NextResponse } from "next/server";
import { isAppError } from "./errors";

export function jsonError(code: string, message: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...(details ?? {}) } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wraps a route handler: AppErrors become clean JSON; anything else becomes a generic 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (isAppError(err)) return jsonError(err.code, err.message, err.status, err.details);
      console.error("[printnow] unhandled error", err);
      return jsonError("INTERNAL_ERROR", "Something went wrong on our side. Please try again.", 500);
    }
  };
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function noStore(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const ORDER_COOKIE_PREFIX = "pn_o_";
export const orderCookieName = (orderId: string) => `${ORDER_COOKIE_PREFIX}${orderId.replace(/-/g, "")}`;
