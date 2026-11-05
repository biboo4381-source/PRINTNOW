import { getActivePrices } from "@/lib/services/pricing";
import { storageMode } from "@/lib/storage";
import { PrintFlowProvider } from "./PrintFlowProvider";

// Prices come from the database, so render on each request (not at build time).
export const dynamic = "force-dynamic";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const prices = await getActivePrices();
  return (
    <PrintFlowProvider prices={prices} uploadMode={storageMode()}>
      {children}
    </PrintFlowProvider>
  );
}
