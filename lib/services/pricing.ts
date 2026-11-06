import { desc, lte } from "drizzle-orm";
import { getDb } from "../db";
import { pricingConfig } from "../db/schema";
import type { PriceTable } from "../pricing";

/** Fallback if the pricing table is somehow empty (prices are set by migrations 0001 and 0003). */
export const DEFAULT_PRICES: PriceTable = { bwPricePerPage: 1000, colorPricePerPage: 2500, currency: "IDR" };

export async function getActivePrices(): Promise<PriceTable> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(pricingConfig)
    .where(lte(pricingConfig.activeFrom, new Date()))
    .orderBy(desc(pricingConfig.activeFrom), desc(pricingConfig.id))
    .limit(1);
  if (!row) return DEFAULT_PRICES;
  return { bwPricePerPage: row.bwPricePerPage, colorPricePerPage: row.colorPricePerPage, currency: "IDR" };
}
