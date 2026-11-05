import { handle, noStore } from "@/lib/http";
import { KIOSK_SESSION_COOKIE } from "@/lib/kiosk-auth";

export const POST = handle(async () => {
  const res = noStore({ ok: true });
  res.cookies.set(KIOSK_SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/kiosk", maxAge: 0 });
  return res;
});
