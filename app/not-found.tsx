import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { ButtonLink, Card, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Container className="max-w-xl py-16">
          <Card className="p-8 text-center">
            <p className="font-display text-5xl font-extrabold text-brand">404</p>
            <h1 className="mt-2 text-2xl font-extrabold">Page not found</h1>
            <p className="mt-2 text-ink-muted">The page you’re looking for doesn’t exist.</p>
            <ButtonLink href="/" className="mt-6">Go to homepage</ButtonLink>
          </Card>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
