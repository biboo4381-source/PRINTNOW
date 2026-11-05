import { cookies } from "next/headers";
import { handle, noStore, orderCookieName } from "@/lib/http";
import { payOrder } from "@/lib/services/orders";

/** Simulated QRIS payment. The ONLY way an order becomes PAID. */
export const POST = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const token = (await cookies()).get(orderCookieName(id))?.value;
  const result = await payOrder(id, token);
  return noStore({ status: "PAID", collectionCode: result.collectionCode, alreadyPaid: result.alreadyPaid });
});
