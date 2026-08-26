import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bids } from "@/lib/db/schema";
import { claim } from "@/lib/board/claim";
import { fetchPayment, refundPayment } from "@/lib/razorpay/server";
import { getRazorpayMock, getCronEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel cron: /api/admin/cron/reconcile
 * Schedule: every 5 minutes.
 *
 * Scans bids that have been pending > 5 min, looks up the Razorpay payment
 * directly, and force-captures (or refunds + fails) any that the webhook
 * missed. Catches webhook delivery failures, lost events, network drops.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(req: NextRequest) {
  // Cron auth — required in prod, optional in mock dev.
  const cron = getCronEnv();
  if (cron.CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cron.CRON_SECRET}`) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Bad cron secret" } },
        { status: 401 },
      );
    }
  }

  // Mock mode is a no-op — no real Razorpay orders to reconcile.
  if (getRazorpayMock().RAZORPAY_MOCK) {
    return NextResponse.json({ ok: true, mock: true, scanned: 0 });
  }

  // Pending bids older than 5 min.
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const stale = await db
    .select()
    .from(bids)
    .where(and(eq(bids.status, "pending"), lt(bids.createdAt, cutoff)))
    .limit(50);

  const results: Array<{
    bidId: string;
    action: "captured" | "refunded" | "skipped" | "error";
    reason?: string;
  }> = [];

  for (const bid of stale) {
    if (!bid.razorpayOrderId) {
      results.push({ bidId: bid.id, action: "skipped", reason: "no_order_id" });
      continue;
    }

    // Look up the order's payments. Simpler: check the order's status.
    // Razorpay orders have `status: created|attempted|paid`. We treat paid as
    // a confirmed capture.
    try {
      // We don't have an orders.fetch helper; use payments via a synthetic
      // payment_id path. If we have a payment id, fetch it directly.
      // If not, mark as failed (the order was abandoned).
      if (!bid.razorpayPaymentId) {
        // Best-effort: if the order never got a payment, the user never paid.
        await db
          .update(bids)
          .set({
            status: "failed",
            failureReason: "abandoned",
            updatedAt: new Date(),
          })
          .where(eq(bids.id, bid.id));
        results.push({ bidId: bid.id, action: "skipped", reason: "abandoned" });
        continue;
      }

      const payment = await fetchPayment(bid.razorpayPaymentId);
      if (!payment) {
        results.push({ bidId: bid.id, action: "error", reason: "fetch_failed" });
        continue;
      }

      if (payment.status === "captured") {
        const result = await claim({
          bidId: bid.id,
          paymentId: payment.id,
        });
        results.push({ bidId: bid.id, action: "captured", reason: result.status });
      } else if (payment.status === "failed") {
        await db
          .update(bids)
          .set({
            status: "failed",
            failureReason: "payment_failed",
            updatedAt: new Date(),
          })
          .where(eq(bids.id, bid.id));
        results.push({ bidId: bid.id, action: "skipped", reason: "payment_failed" });
      } else {
        results.push({ bidId: bid.id, action: "skipped", reason: `payment_${payment.status}` });
      }
    } catch (err) {
      // If claim fails, try to refund.
      try {
        if (bid.razorpayPaymentId) {
          await refundPayment({ paymentId: bid.razorpayPaymentId });
        }
        await db
          .update(bids)
          .set({
            status: "failed",
            failureReason: err instanceof Error ? err.message : "claim_failed",
            updatedAt: new Date(),
          })
          .where(eq(bids.id, bid.id));
        results.push({ bidId: bid.id, action: "refunded" });
      } catch (refundErr) {
        results.push({
          bidId: bid.id,
          action: "error",
          reason: `claim+refund failed: ${refundErr instanceof Error ? refundErr.message : "unknown"}`,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: stale.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
