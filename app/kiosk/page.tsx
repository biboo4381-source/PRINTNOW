import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { currentKioskId } from "@/lib/kiosk-session";
import { KioskApp } from "./_components/KioskApp";

export const dynamic = "force-dynamic";

/** The permanent website link shown on the kiosk's UPLOAD FILE screen (no sessions, same for everyone). */
const UPLOAD_URL = process.env.KIOSK_UPLOAD_URL || "https://printnow-web.vercel.app/print";

export default async function KioskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const kioskId = await currentKioskId();
  if (!kioskId) redirect("/kiosk/setup");

  const qrSvg = await QRCode.toString(UPLOAD_URL, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0C2C55", light: "#FFFFFF" },
  });

  // ?idle=N shortens the inactivity timeout (used for testing); clamped to a sane range.
  const sp = await searchParams;
  const idle = Number(Array.isArray(sp.idle) ? sp.idle[0] : sp.idle);
  const idleSeconds = Number.isFinite(idle) ? Math.min(300, Math.max(3, idle)) : 60;

  return <KioskApp kioskId={kioskId} uploadUrl={UPLOAD_URL} qrSvg={qrSvg} idleSeconds={idleSeconds} />;
}
