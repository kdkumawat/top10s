import { createHmac, timingSafeEqual } from "node:crypto";
import { getRazorpayEnv } from "@/lib/env";

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay sends the raw JSON body and `x-razorpay-signature` header
 * (hex-encoded HMAC SHA-256 of the body using the webhook secret).
 *
 * Uses timing-safe comparison.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const { RAZORPAY_WEBHOOK_SECRET } = getRazorpayEnv();
  const expected = createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
