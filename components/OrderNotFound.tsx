import { SearchX } from "lucide-react";
import { ButtonLink, Card, Container } from "./ui";

export function OrderNotFound() {
  return (
    <Container className="max-w-xl py-12">
      <Card className="p-8 text-center">
        <SearchX className="mx-auto h-12 w-12 text-brand" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-extrabold">Order not found</h1>
        <p className="mt-2 text-ink-muted">
          For your privacy, an order can only be opened in the browser that created it. If you already paid, use the collection code
          you received at the kiosk.
        </p>
        <ButtonLink href="/print" className="mt-6">Start a new order</ButtonLink>
      </Card>
    </Container>
  );
}
