/**
 * Signature verification test vectors.
 * Run: npx tsx scripts/test-verify.ts
 */
import { createHmac } from "node:crypto";

process.env.RAZORPAY_KEY_ID = "rzp_test_x";
process.env.RAZORPAY_KEY_SECRET = "rzp_secret_x";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_123";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://x:y@localhost/z?sslmode=require";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
process.env.CLERK_SECRET_KEY = "sk_test_x";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

import { verifyRazorpaySignature } from "../lib/razorpay/verify";

const body = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: { entity: { id: "pay_123", order_id: "order_123", amount: 8334 } },
  },
});
const validSig = createHmac("sha256", "test_webhook_secret_123").update(body).digest("hex");

type Case = { name: string; pass: boolean };
const cases: Case[] = [];

cases.push({
  name: "valid signature",
  pass: verifyRazorpaySignature(body, validSig) === true,
});
cases.push({
  name: "bad signature",
  pass: verifyRazorpaySignature(body, "a".repeat(64)) === false,
});
cases.push({
  name: "missing signature",
  pass: verifyRazorpaySignature(body, null) === false,
});
cases.push({
  name: "length mismatch",
  pass: verifyRazorpaySignature(body, "abcd") === false,
});
cases.push({
  name: "tampered body",
  pass: verifyRazorpaySignature(body + " ", validSig) === false,
});
const wrongSig = createHmac("sha256", "different_secret").update(body).digest("hex");
cases.push({
  name: "wrong secret",
  pass: verifyRazorpaySignature(body, wrongSig) === false,
});

let failed = 0;
for (const c of cases) {
  const tag = c.pass ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${c.name}`);
  if (!c.pass) failed++;
}

if (failed > 0) {
  console.error(`\n[verify-test] FAIL: ${failed}/${cases.length}`);
  process.exit(1);
}
console.log(`\n[verify-test] PASS: ${cases.length}/${cases.length}`);
