import { ChevronDown } from "lucide-react";
import { LIMITS, SUPPORT_CONTACT } from "@/lib/config";

export const FAQ_ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I upload my document?",
    a: (
      <>
        Tap <strong>Start printing</strong>, then drag your files into the box or tap <strong>Browse files</strong>. On a phone
        you can pick files from your storage or photo gallery. You can add up to {LIMITS.maxFilesPerOrder} files per order.
      </>
    ),
  },
  {
    q: "Which file types can I print?",
    a: (
      <>
        PDF, JPG and PNG, up to {LIMITS.maxFileBytes / (1024 * 1024)} MB each. Word or PowerPoint files need to be saved as PDF
        first. Password-protected PDFs can’t be printed, so remove the password first.
      </>
    ),
  },
  {
    q: "How do I choose my print settings?",
    a: (
      <>
        After uploading, choose <strong>Black &amp; White</strong> or <strong>Color</strong>, the number of copies, and whether to
        print all pages or only some (for example <em>1-3, 5</em>). Everything is printed on A4 paper, single-sided. The price
        updates as you change settings.
      </>
    ),
  },
  {
    q: "How does payment work?",
    a: (
      <>
        This is an academic prototype, so payment is a <strong>demo QRIS</strong>. No real money is taken. Tap{" "}
        <strong>Simulate successful payment</strong> to finish your order and get your collection code.
      </>
    ),
  },
  {
    q: "How do I collect my prints?",
    a: (
      <>
        Go to any PRINTNOW kiosk, tap <strong>COLLECTION CODE</strong>, type your code (it looks like <em>PN 482 917</em>), confirm
        your order and collect your pages. Codes are valid for 7 days.
      </>
    ),
  },
  {
    q: "My collection code doesn’t work. What should I do?",
    a: (
      <>
        Check that you typed all 6 digits correctly. A code stops working once the order has been printed or after 7 days. If it
        still doesn’t work, contact us at <a className="font-semibold text-brand underline" href={`mailto:${SUPPORT_CONTACT.email}`}>{SUPPORT_CONTACT.email}</a>{" "}
        with your order reference (it starts with <em>PNO-</em>).
      </>
    ),
  },
  {
    q: "What happens to my files?",
    a: <>Your files are stored privately and deleted automatically after your order is printed, cancelled or expires.</>,
  },
];

export function Faq({ items = FAQ_ITEMS }: { items?: typeof FAQ_ITEMS }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-semibold hover:bg-surface/60 [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown className="h-5 w-5 shrink-0 text-brand transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="px-5 pb-5 text-ink-muted">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
