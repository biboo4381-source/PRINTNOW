import { cookies } from "next/headers";
import { AppError } from "./errors";
import { KIOSK_SESSION_COOKIE, readKioskSession } from "./kiosk-auth";

/** Kiosk ID of this paired device (server components / route handlers), or null. */
export async function currentKioskId(): Promise<string | null> {
  return readKioskSession((await cookies()).get(KIOSK_SESSION_COOKIE)?.value);
}

/** Like currentKioskId() but throws 401 for unpaired devices. */
export async function requireKiosk(): Promise<string> {
  const id = await currentKioskId();
  if (!id) throw new AppError("KIOSK_NOT_PAIRED", "This device is not set up as a PRINTNOW kiosk.", 401);
  return id;
}
