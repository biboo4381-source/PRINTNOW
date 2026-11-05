import { cookies } from "next/headers";
import { handle, jsonError, noStore, orderCookieName } from "@/lib/http";
import { getOrderForCustomer } from "@/lib/services/orders";

export const GET = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const token = (await cookies()).get(orderCookieName(id))?.value;
  const order = await getOrderForCustomer(id, token);
  if (!order) return jsonError("ORDER_NOT_FOUND", "Order not found.", 404);
  return noStore({ order });
});
