import { handle, noStore } from "@/lib/http";
import { getActivePrices } from "@/lib/services/pricing";

export const GET = handle(async () => noStore({ prices: await getActivePrices() }));
