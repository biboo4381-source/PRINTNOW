import Link from "next/link";
import { Mail, Phone, Printer } from "lucide-react";
import { SUPPORT_CONTACT } from "@/lib/config";
import { Logo } from "./Logo";
import { ButtonLink, Container } from "./ui";

export function SiteHeader({ showCta = true }: { showCta?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-white/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-3">
        <Link href="/" aria-label="PRINTNOW home" className="rounded-xl">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link href="/#how-it-works" className="hidden rounded-xl px-3 py-2 font-medium text-ink-muted hover:text-brand sm:block">
            How it works
          </Link>
          <Link href="/help" className="rounded-xl px-3 py-2 font-medium text-ink-muted hover:text-brand">
            Help
          </Link>
          {showCta && (
            <ButtonLink href="/print" className="min-h-11 px-3.5 sm:px-4" aria-label="Start printing">
              <Printer className="h-5 w-5" aria-hidden="true" />
              <span className="sm:hidden">Print</span>
              <span className="hidden sm:inline">Start printing</span>
            </ButtonLink>
          )}
        </nav>
      </Container>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <Container className="grid grid-cols-1 gap-8 py-10 sm:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-ink-muted">
            Self-service document printing. Upload from your phone, collect at a PRINTNOW kiosk.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider">Help</h2>
          <ul className="mt-3 space-y-2 text-ink-muted">
            <li><Link className="hover:text-brand" href="/help">How it works &amp; FAQ</Link></li>
            <li><Link className="hover:text-brand" href="/privacy">Privacy &amp; your files</Link></li>
            <li><Link className="hover:text-brand" href="/print">Start printing</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider">Contact</h2>
          <ul className="mt-3 space-y-2 text-ink-muted">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4" aria-hidden="true" />
              <a className="hover:text-brand" href={`mailto:${SUPPORT_CONTACT.email}`}>{SUPPORT_CONTACT.email}</a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4" aria-hidden="true" />
              <span>{SUPPORT_CONTACT.phone}</span>
            </li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-line py-4 text-center text-xs text-ink-muted">
        © {new Date().getFullYear()} PRINTNOW · Academic prototype. Payments on this site are simulated.
      </div>
    </footer>
  );
}
