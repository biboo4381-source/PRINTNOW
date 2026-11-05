import { CreditCard, FileText, ImageIcon, MapPin, Printer, Recycle, ShieldCheck, Smartphone, Upload } from "lucide-react";
import { FAQ_ITEMS, Faq } from "@/components/Faq";
import { ButtonLink, Card, Container } from "@/components/ui";
import { LIMITS } from "@/lib/config";

const steps = [
  { icon: Upload, title: "Upload your document", text: "PDF, JPG or PNG, straight from your phone or computer." },
  { icon: CreditCard, title: "Configure & pay", text: "Pick color, copies and pages. See the price instantly, then pay." },
  { icon: Printer, title: "Collect at a kiosk", text: "Enter your collection code at any PRINTNOW kiosk and take your prints." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-surface">
        <Container className="grid grid-cols-1 items-center gap-10 py-10 sm:py-16 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand">
              <MapPin className="h-4 w-4" aria-hidden="true" /> Campuses · Airports · Malls · Public offices
            </p>
            <h1 className="text-4xl font-extrabold sm:text-5xl lg:text-6xl">
              Print anywhere.
              <br />
              <span className="text-brand">Upload now,</span> collect at a kiosk.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-muted sm:text-xl">
              Send your document from your phone, choose how to print it, and pick it up at a PRINTNOW kiosk. No USB, no queue, no
              cables.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/print" size="lg" className="w-full sm:w-auto">
                <Printer className="h-6 w-6" aria-hidden="true" /> START PRINTING
              </ButtonLink>
              <ButtonLink href="#how-it-works" variant="secondary" size="lg" className="w-full sm:w-auto">
                How it works
              </ButtonLink>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-muted">
              <li className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-green" aria-hidden="true" /> Files stored privately</li>
              <li className="flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-green" aria-hidden="true" /> Made for phones</li>
              <li className="flex items-center gap-1.5"><Recycle className="h-4 w-4 text-green" aria-hidden="true" /> Print only what you need</li>
            </ul>
          </div>
          <HeroIllustration />
        </Container>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 py-12 sm:py-16">
        <Container>
          <h2 className="text-3xl font-extrabold sm:text-4xl">How it works</h2>
          <p className="mt-2 text-lg text-ink-muted">Three steps. About a minute on your phone.</p>
          <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title}>
                <Card className="h-full p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand">
                      <s.icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="font-display text-sm font-bold text-ink-muted">STEP {i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
                  <p className="mt-1 text-ink-muted">{s.text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Formats */}
      <section className="pb-12 sm:pb-16">
        <Container>
          <Card className="grid grid-cols-1 gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-2xl font-extrabold">Supported files</h2>
              <p className="mt-1 text-ink-muted">
                Up to {LIMITS.maxFilesPerOrder} files per order, {LIMITS.maxFileBytes / (1024 * 1024)} MB each. Printed on A4 paper in
                black &amp; white or color.
              </p>
            </div>
            <ul className="flex flex-wrap gap-3" aria-label="Supported formats">
              {[
                { label: "PDF", icon: FileText },
                { label: "JPG", icon: ImageIcon },
                { label: "PNG", icon: ImageIcon },
              ].map((f) => (
                <li key={f.label} className="flex items-center gap-2 rounded-2xl border-2 border-line px-4 py-3 font-bold">
                  <f.icon className="h-5 w-5 text-brand" aria-hidden="true" /> {f.label}
                </li>
              ))}
            </ul>
          </Card>
        </Container>
      </section>

      {/* FAQ preview */}
      <section className="pb-4">
        <Container>
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Questions</h2>
            <ButtonLink href="/help" variant="ghost">All questions</ButtonLink>
          </div>
          <div className="mt-6">
            <Faq items={FAQ_ITEMS.slice(0, 5)} />
          </div>
          <div className="mt-10 rounded-[var(--radius-card)] bg-navy p-8 text-center text-white sm:p-10">
            <h2 className="text-2xl font-extrabold sm:text-3xl">Ready to print?</h2>
            <p className="mt-2 text-white/80">Your code will be waiting for you at the kiosk.</p>
            <ButtonLink href="/print" size="lg" className="mt-6 w-full sm:w-auto">
              <Printer className="h-6 w-6" aria-hidden="true" /> START PRINTING
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}

function HeroIllustration() {
  return (
    <div className="relative mx-auto hidden w-full max-w-sm sm:block" aria-hidden="true">
      <div className="absolute -right-6 -top-6 h-40 w-40 rounded-full bg-brand-100 blur-2xl" />
      <div className="relative rounded-[2rem] border-8 border-navy bg-white p-5 shadow-[var(--shadow-lift)]">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display font-extrabold">PRINT<span className="text-brand">NOW</span></span>
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green">PAID</span>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Collection code</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-navy">PN 482 917</p>
        </div>
        <div className="mt-4 space-y-2">
          {["Thesis_Final.pdf · 42 pages", "Poster.png · Color"].map((t) => (
            <div key={t} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <FileText className="h-4 w-4 text-brand" /> {t}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-brand py-3 font-bold text-white">
          <Printer className="h-5 w-5" /> Collect at kiosk
        </div>
      </div>
    </div>
  );
}
