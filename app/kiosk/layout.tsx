import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "PRINTNOW Kiosk",
  description: "PRINTNOW self-service kiosk",
  robots: { index: false, follow: false },
  manifest: "/kiosk.webmanifest",
  appleWebApp: { capable: true, title: "PRINTNOW Kiosk", statusBarStyle: "black-translucent" },
};

// Touchscreen terminal: no pinch-zoom, fills the screen edge to edge.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0C2C55",
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kiosk flex min-h-dvh flex-col bg-surface text-navy select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]">
      {children}
    </div>
  );
}
