import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PRINTNOW — Upload now, collect at a kiosk",
    template: "%s · PRINTNOW",
  },
  description:
    "Upload your PDF, JPG or PNG, choose your print settings, pay, and collect your prints at a PRINTNOW self-service kiosk.",
  applicationName: "PRINTNOW",
};

export const viewport: Viewport = {
  themeColor: "#0877F9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
