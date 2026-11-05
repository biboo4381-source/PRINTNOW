import { FileText, ImageIcon } from "lucide-react";
import { formatRupiah } from "@/lib/pricing";
import type { OrderView } from "@/lib/services/orders";

export function OrderSummary({ order }: { order: OrderView }) {
  return (
    <div>
      <ul className="divide-y divide-line">
        {order.items.map((item) => {
          const Icon = item.format === "PDF" ? FileText : ImageIcon;
          return (
            <li key={item.fileId} className="flex gap-3 py-3" data-testid="summary-line">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold" title={item.name}>{item.name}</p>
                <p className="text-sm text-ink-muted">
                  {item.colorMode === "COLOR" ? "Color" : "Black & White"} · {item.copies} cop{item.copies === 1 ? "y" : "ies"} · Pages{" "}
                  {item.pageSelection === "all" ? `all (${item.pageCount})` : item.pageSelection} · A4
                </p>
                <p className="text-sm text-ink-muted">
                  {item.printedPages} printed × {formatRupiah(item.pricePerPage)}
                </p>
              </div>
              <p className="font-semibold">{formatRupiah(item.subtotal)}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t-2 border-navy/10 pt-3">
        <p className="font-semibold">
          Total <span className="font-normal text-ink-muted">· {order.totalPrintedPages} printed pages</span>
        </p>
        <p className="font-display text-2xl font-extrabold" data-testid="summary-total">{formatRupiah(order.totalPrice)}</p>
      </div>
    </div>
  );
}
