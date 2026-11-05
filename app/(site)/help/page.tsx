import type { Metadata } from "next";
import { Keyboard, ListChecks, MapPin, Printer, Smartphone } from "lucide-react";
import { Faq } from "@/components/Faq";
import { ButtonLink, Card, Container, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "How it works & FAQ" };

const kioskSteps = [
  { icon: MapPin, text: "Visit any PRINTNOW kiosk." },
  { icon: Smartphone, text: "Tap “COLLECTION CODE” on the screen." },
  { icon: Keyboard, text: "Enter your code, for example PN 482 917." },
  { icon: ListChecks, text: "Check that the order shown is yours and confirm." },
  { icon: Printer, text: "Collect your printed documents." },
];

export default function HelpPage() {
  return (
    <Container className="py-8 sm:py-12">
      <PageTitle eyebrow="Help" title="How PRINTNOW works" subtitle="Short answers to the most common questions." />

      <Card className="mb-8 p-6 sm:p-8">
        <h2 className="text-2xl font-extrabold">Collecting at the kiosk</h2>
        <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {kioskSteps.map((s, i) => (
            <li key={s.text} className="flex gap-3 rounded-2xl bg-surface p-4 sm:flex-col">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand shadow-sm">
                <s.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p>
                <span className="font-bold">{i + 1}. </span>
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      <h2 className="mb-4 text-2xl font-extrabold">Frequently asked questions</h2>
      <Faq />

      <div className="mt-8 text-center">
        <ButtonLink href="/print" size="lg">
          <Printer className="h-6 w-6" aria-hidden="true" /> Start printing
        </ButtonLink>
      </div>
    </Container>
  );
}
