import type { Metadata } from "next";
import { currentKioskId } from "@/lib/kiosk-session";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "Kiosk setup · PRINTNOW" };
export const dynamic = "force-dynamic";

export default async function KioskSetupPage() {
  const kioskId = await currentKioskId();
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <SetupForm pairedAs={kioskId} />
    </main>
  );
}
