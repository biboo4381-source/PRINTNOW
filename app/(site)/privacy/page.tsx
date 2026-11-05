import type { Metadata } from "next";
import { Card, Container, PageTitle } from "@/components/ui";
import { EXPIRY, SUPPORT_CONTACT } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy & your files" };

export default function PrivacyPage() {
  return (
    <Container className="py-8 sm:py-12">
      <PageTitle eyebrow="Privacy" title="Your files, kept private" />
      <Card className="space-y-5 p-6 text-lg text-ink-muted sm:p-8">
        <p>
          <strong className="text-navy">Private storage.</strong> Uploaded files are stored in private cloud storage. They are never
          published at a public link. Only a PRINTNOW kiosk that has your collection code can download them, and only while printing
          your order.
        </p>
        <p>
          <strong className="text-navy">Automatic deletion.</strong> Files are deleted automatically about {EXPIRY.fileRetentionHours}{" "}
          hours after your order is printed or cancelled, when an unpaid order expires ({EXPIRY.unpaidHours} hours), or when a paid
          order isn’t collected within {EXPIRY.paidDays} days.
        </p>
        <p>
          <strong className="text-navy">No account needed.</strong> We don’t ask for your name, email or phone number. Your order can
          only be viewed from the browser that created it.
        </p>
        <p>
          <strong className="text-navy">Demo payments.</strong> This is an academic prototype. The QRIS payment is simulated and no
          payment details are collected.
        </p>
        <p>
          Questions? Contact{" "}
          <a className="font-semibold text-brand underline" href={`mailto:${SUPPORT_CONTACT.email}`}>
            {SUPPORT_CONTACT.email}
          </a>
          .
        </p>
      </Card>
    </Container>
  );
}
