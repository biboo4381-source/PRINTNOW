import { cookies } from "next/headers";
import { orderCookieName } from "./http";
import { getOrderForCustomer } from "./services/orders";

/** Loads an order for a page, using this browser's order cookie. */
export async function loadCustomerOrder(orderId: string) {
  const token = (await cookies()).get(orderCookieName(orderId))?.value;
  return getOrderForCustomer(orderId, token);
}
