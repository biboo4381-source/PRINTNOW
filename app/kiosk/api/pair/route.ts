import { handle, jsonError, noStore, readJson } from "@/lib/http";
import { KIOSK_SESSION_COOKIE, KIOSK_SESSION_DAYS, createKioskSession, verifyKioskKey } from "@/lib/kiosk-auth";

/** Staff pair a device as a kiosk once, with the kiosk ID and its API key. */
export const POST = handle(async (request: Request) => {
  const body = await readJson(request);
  const kioskId = typeof body.kioskId === "string" ? body.kioskId.trim() : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!verifyKioskKey(kioskId, key)) {
    return jsonError("UNAUTHORIZED", "Kiosk ID or key is incorrect.", 401);
  }
  const res = noStore({ kioskId });
  res.cookies.set(KIOSK_SESSION_COOKIE, createKioskSession(kioskId), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" && process.env.PLAYWRIGHT_E2E !== "1",
    path: "/kiosk",
    maxAge: KIOSK_SESSION_DAYS * 86_400,
  });
  return res;
});
