import { cookies } from "next/headers";
import { handle, noStore, orderCookieName } from "@/lib/http";
import { cancelOrder } from "@/lib/services/orders";

export const POST = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const token = (await cookies()).get(orderCookieName(id))?.value;
  await cancelOrder(id, token);
  return noStore({ status: "CANCELLED" });
});
