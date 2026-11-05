import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { Clock, TriangleAlert } from "lucide-react";
import { OrderNotFound } from "@/components/OrderNotFound";
import { OrderSummary } from "@/components/OrderSummary";
import { Stepper } from "@/components/Stepper";
import { ButtonLink, Card, Container, PageTitle } from "@/components/ui";
import { loadCustomerOrder } from "@/lib/order-page";
import { formatRupiah } from "@/lib/pricing";
import { PayActions } from "./PayActions";

export const metadata: Metadata = { title: "Payment (demo)", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await loadCustomerOrder(orderId);
  if (!order) return <OrderNotFound />;
  if (order.paymentStatus === "PAID") redirect(`/order/${order.id}`);

  if (order.status !== "PENDING_PAYMENT") {
    return (
      <Container className="max-w-xl py-12">
        <Card className="p-8 text-center">
          <Clock className="mx-auto h-12 w-12 text-warning" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-extrabold">
            {order.status === "CANCELLED" ? "This order was cancelled" : "This order has expired"}
          </h1>
          <p className="mt-2 text-ink-muted">Unpaid orders are kept for 24 hours. Please start a new order.</p>
          <ButtonLink href="/print" className="mt-6">Start a new order</ButtonLink>
        </Card>
      </Container>
    );
  }

  // Illustrative QR only: it encodes a harmless demo string, NOT a real QRIS payload.
  const qrSvg = await QRCode.toString(`PRINTNOW DEMO PAYMENT | ${order.orderRef} | NOT A REAL TRANSACTION`, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0C2C55", light: "#FFFFFF" },
  });

  return (
    <Container className="max-w-3xl py-6 sm:py-10">
      <Stepper current={2} />

      <div
        role="note"
        className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-warning/40 bg-warning-50 px-4 py-3 font-bold text-warning"
        data-testid="demo-banner"
      >
        <TriangleAlert className="h-6 w-6 shrink-0" aria-hidden="true" />
        DEMO PAYMENT — NOT A REAL TRANSACTION
      </div>

      <PageTitle title="Pay with QRIS" subtitle={<>Order <span className="font-mono font-semibold text-navy">{order.orderRef}</span></>} />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.1fr]">
        <Card className="flex flex-col items-center p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Amount to pay</p>
          <p className="font-display text-4xl font-extrabold" data-testid="pay-amount">{formatRupiah(order.totalPrice)}</p>
          <div className="relative mt-5 w-full max-w-[260px] rounded-2xl border-2 border-line p-3">
            <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} aria-hidden="true" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-lg border-2 border-danger bg-white/95 px-3 py-1 font-display text-2xl font-extrabold tracking-widest text-danger">
              DEMO
            </span>
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            Illustrative QR code for the prototype. Scanning it does not make a payment.
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="mb-2 text-lg font-bold">Order summary</h2>
          <OrderSummary order={order} />
        </Card>
      </div>

      <PayActions orderId={order.id} />
    </Container>
  );
}
