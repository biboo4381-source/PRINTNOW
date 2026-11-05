"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink, Card, Container } from "@/components/ui";
import { SUPPORT_CONTACT } from "@/lib/config";

/** Friendly fallback when a page fails on the server (e.g. database temporarily unavailable). */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="max-w-xl py-16">
      <Card className="p-8 text-center">
        <TriangleAlert className="mx-auto h-12 w-12 text-warning" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-extrabold">Something went wrong</h1>
        <p className="mt-2 text-ink-muted">
          We couldn’t load this page. Please try again in a moment. If it keeps happening, contact{" "}
          <a className="font-semibold text-brand underline" href={`mailto:${SUPPORT_CONTACT.email}`}>{SUPPORT_CONTACT.email}</a>.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-ink-muted">Error ID: {error.digest}</p>}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={reset}>
            <RefreshCw className="h-5 w-5" aria-hidden="true" /> Try again
          </Button>
          <ButtonLink href="/" variant="secondary">Go to homepage</ButtonLink>
        </div>
      </Card>
    </Container>
  );
}
