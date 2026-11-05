import { EXPIRY } from "@/lib/config";
import { handle, noStore, orderCookieName, readJson } from "@/lib/http";
import { createOrder } from "@/lib/services/orders";

export const POST = handle(async (request: Request) => {
  const body = await readJson(request);
  const { orderId, accessToken } = await createOrder(body.items);
  const response = noStore({ orderId }, { status: 201 });
  // The access token proves this browser created the order. HttpOnly: page scripts can't read it.
  response.cookies.set(orderCookieName(orderId), accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: (EXPIRY.paidDays + 1) * 24 * 60 * 60,
  });
  return response;
});
