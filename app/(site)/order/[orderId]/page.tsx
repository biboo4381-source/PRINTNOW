import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheck, CircleX, Clock, Keyboard, ListChecks, LoaderCircle, MapPin, Printer, Smartphone } from "lucide-react";
import { OrderNotFound } from "@/components/OrderNotFound";
import { OrderSummary } from "@/components/OrderSummary";
import { Stepper } from "@/components/Stepper";
import { ButtonLink, Card, Container } from "@/components/ui";
import { SUPPORT_CONTACT } from "@/lib/config";
import { loadCustomerOrder } from "@/lib/order-page";
import type { OrderView } from "@/lib/services/orders";
import { CollectionCode } from "./CollectionCode";

export const metadata: Metadata = { title: "Your collection code", robots: { index: false } };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await loadCustomerOrder(orderId);
  if (!order) return <OrderNotFound />;
  if (order.status === "PENDING_PAYMENT") redirect(`/pay/${order.id}`);

  return (
    <Container className="max-w-3xl py-6 sm:py-10">
      <Stepper current={order.status === "COMPLETED" ? 4 : 3} />
      <StatusHeader order={order} />

      {order.status === "PAID" && order.collectionCode && (
        <>
          <CollectionCode code={order.collectionCode} />
          <p className="mt-3 flex items-center justify-center gap-2 text-center text-sm text-ink-muted">
            <Clock className="h-4 w-4" aria-hidden="true" /> Valid until {dateFmt.format(new Date(order.expiresAt))} WIB
          </p>
          <KioskSteps />
        </>
      )}

      <Card className="mt-6 p-5 sm:p-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Order details</h2>
          <p className="text-sm text-ink-muted">
            Reference <span className="font-mono font-semibold text-navy" data-testid="order-ref">{order.orderRef}</span>
          </p>
        </div>
        {order.paidAt && <p className="text-sm text-ink-muted">Paid (demo QRIS) on {dateFmt.format(new Date(order.paidAt))} WIB</p>}
        <OrderSummary order={order} />
      </Card>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <ButtonLink href="/print" variant="secondary">Print something else</ButtonLink>
        <ButtonLink href="/help" variant="ghost">Need help?</ButtonLink>
      </div>
    </Container>
  );
}

function StatusHeader({ order }: { order: OrderView }) {
  const states: Record<string, { icon: typeof CircleCheck; color: string; title: string; text: string }> = {
    PAID: {
      icon: CircleCheck,
      color: "text-green",
      title: "Payment successful!",
      text: "Your order is ready. Show up at any PRINTNOW kiosk and enter this code.",
    },
    PROCESSING: { icon: LoaderCircle, color: "text-brand", title: "Printing in progress", text: "A kiosk is printing your order right now." },
    COMPLETED: { icon: Printer, color: "text-green", title: "Printed. Thank you!", text: "Your order has been collected. The code can’t be used again." },
    EXPIRED: { icon: Clock, color: "text-warning", title: "This order has expired", text: "The collection code is no longer valid." },
    FAILED: {
      icon: CircleX,
      color: "text-danger",
      title: "Printing failed",
      text: `Something went wrong at the kiosk. Please contact ${SUPPORT_CONTACT.email} with your order reference.`,
    },
    CANCELLED: { icon: CircleX, color: "text-ink-muted", title: "Order cancelled", text: "This order was cancelled." },
  };
  const s = states[order.status] ?? states.PAID;
  return (
    <div className="mb-6 text-center" data-testid="order-status" data-status={order.status}>
      <s.icon className={`mx-auto h-14 w-14 ${s.color}`} aria-hidden="true" />
      <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{s.title}</h1>
      <p className="mx-auto mt-2 max-w-lg text-lg text-ink-muted">{s.text}</p>
    </div>
  );
}

function KioskSteps() {
  const steps = [
    { icon: MapPin, text: "Visit a PRINTNOW kiosk" },
    { icon: Smartphone, text: "Select “COLLECTION CODE”" },
    { icon: Keyboard, text: "Enter your collection code" },
    { icon: ListChecks, text: "Confirm your order" },
    { icon: Printer, text: "Collect your printed documents" },
  ];
  return (
    <Card className="mt-6 p-5 sm:p-6">
      <h2 className="text-lg font-bold">How to collect</h2>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.text} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
              <s.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg">
              <span className="font-bold">{i + 1}.</span> {s.text}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
