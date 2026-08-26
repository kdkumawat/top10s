import "server-only";
import { randomUUID } from "node:crypto";
import { getRazorpayEnv, getRazorpayMock } from "@/lib/env";

/**
 * Razorpay server-side wrapper.
 *
 * In real mode (RAZORPAY_MOCK=false), all calls hit the Razorpay API and the
 * `payment.captured` webhook drives `claim()`. In mock mode, calls are stubbed
 * and `claim()` is invoked synchronously after `createOrder()` (no webhook).
 *
 * Mock mode is for local dev — keeps the atomic-claim logic exercised without
 * needing a real Razorpay account or webhook tunnel.
 */

export type RazorpayOrder = {
  id: string;
  amount: number; // paise
  currency: string;
  receipt: string;
  status: "created" | "paid" | "failed";
};

export type RazorpayPayment = {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: "captured" | "failed" | "refunded";
};

function isMock(): boolean {
  return getRazorpayMock().RAZORPAY_MOCK;
}

/** Create a Razorpay order. Returns synthetic order in mock mode. */
export async function createOrder(input: {
  amount: number;
  currency: string;
  receipt: string;
}): Promise<RazorpayOrder> {
  if (isMock()) {
    return {
      id: `mock_order_${randomUUID()}`,
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      status: "created",
    };
  }
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = getRazorpayEnv();
  const { default: Razorpay } = await import("razorpay");
  const rzp = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  const order = await rzp.orders.create({
    amount: input.amount,
    currency: input.currency,
    receipt: input.receipt,
  });
  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    receipt: order.receipt ?? input.receipt,
    status: "created",
  };
}

/** Refund a payment. Returns the refund id (or synthetic one in mock). */
export async function refundPayment(input: {
  paymentId: string;
  amount?: number;
}): Promise<{ id: string; paymentId: string; amount: number }> {
  if (isMock()) {
    return {
      id: `mock_refund_${randomUUID()}`,
      paymentId: input.paymentId,
      amount: input.amount ?? 0,
    };
  }
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = getRazorpayEnv();
  const { default: Razorpay } = await import("razorpay");
  const rzp = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  const refund = await rzp.payments.refund(input.paymentId, {
    amount: input.amount,
  });
  return {
    id: refund.id,
    paymentId: input.paymentId,
    amount: Number(refund.amount ?? input.amount ?? 0),
  };
}

/** Fetch a payment by id. */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment | null> {
  if (isMock()) return null;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = getRazorpayEnv();
  const { default: Razorpay } = await import("razorpay");
  const rzp = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  try {
    const p = await rzp.payments.fetch(paymentId);
    return {
      id: p.id,
      orderId: p.order_id,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status as RazorpayPayment["status"],
    };
  } catch {
    return null;
  }
}

/** Used by the API to surface which key to load in the client widget. */
export function getPublicRazorpayKey(): string {
  if (isMock()) return "rzp_test_mock";
  return getRazorpayEnv().RAZORPAY_KEY_ID;
}
