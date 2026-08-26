import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bids, webhookEvents, positions, listings } from "@/lib/db/schema";
import { verifyRazorpaySignature } from "@/lib/razorpay/verify";
import { claim } from "@/lib/board/claim";
import { refundPayment } from "@/lib/razorpay/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook handler.
 *
 * Subscribed events: payment.captured, payment.failed, refund.processed
 * Signature: x-razorpay-signature header (HMAC SHA-256 of raw body).
 *
 * On payment.captured: look up bid by razorpay_order_id, invoke claim().
 *   If claim() throws → refund + mark bid failed.
 * On payment.failed: mark bid failed.
 * On refund.processed: mark bid refunded.
 *
 * Idempotency: UNIQUE (provider, event_id) in webhook_events.
 */
type RazorpayWebhookEvent = {
  event: string;
  // payment.captured
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id: string;
        amount: number;
      };
    };
    refund?: {
      entity?: {
        id: string;
        payment_id: string;
        amount: number;
      };
    };
  };
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyRazorpaySignature(raw, signature)) {
    return NextResponse.json(
      { error: { code: "invalid_signature", message: "Bad signature" } },
      { status: 400 },
    );
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  // Use the underlying event id (Razorpay doesn't always include one on
  // capture events; synthesize from payment_id or order_id for dedupe).
  const eventId =
    (event.payload?.payment?.entity?.id ?? event.payload?.refund?.entity?.id) ??
    `${event.event}:${event.payload?.payment?.entity?.order_id ?? ""}:${Date.now()}`;

  // Idempotency insert — UNIQUE (provider, event_id) does the dedupe.
  try {
    await db.insert(webhookEvents).values({
      provider: "razorpay",
      eventId,
      eventType: event.event,
      payload: event,
    });
  } catch {
    // Duplicate — already processed.
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;
      if (!payment) {
        return NextResponse.json({ ok: true, skipped: "no_payment" });
      }

      const bidRows = await db
        .select()
        .from(bids)
        .where(eq(bids.razorpayOrderId, payment.order_id))
        .limit(1);
      if (bidRows.length === 0) {
        return NextResponse.json({ ok: true, skipped: "no_bid" });
      }
      const bid = bidRows[0]!;
      if (bid.status === "captured") {
        return NextResponse.json({ ok: true, skipped: "already_captured" });
      }

      try {
        const result = await claim({
          bidId: bid.id,
          paymentId: payment.id,
        });
        return NextResponse.json({ ok: true, result });
      } catch (err) {
        // Claim invalid → refund + mark failed.
        // eslint-disable-next-line no-console
        console.error("[razorpay webhook] claim failed, refunding", err);
        try {
          await refundPayment({ paymentId: payment.id, amount: payment.amount });
        } catch (refundErr) {
          // eslint-disable-next-line no-console
          console.error("[razorpay webhook] refund failed", refundErr);
        }
        await db
          .update(bids)
          .set({
            status: "failed",
            failureReason: err instanceof Error ? err.message : "claim_failed",
            updatedAt: new Date(),
          })
          .where(eq(bids.id, bid.id));
        return NextResponse.json({ ok: true, refunded: true });
      }
    }

    if (event.event === "payment.failed") {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id) {
        const bidRows = await db
          .select()
          .from(bids)
          .where(eq(bids.razorpayOrderId, payment.order_id))
          .limit(1);
        if (bidRows[0] && bidRows[0].status === "pending") {
          await db
            .update(bids)
            .set({
              status: "failed",
              failureReason: "payment_failed",
              updatedAt: new Date(),
            })
            .where(eq(bids.id, bidRows[0].id));
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (event.event === "refund.processed") {
      const refund = event.payload?.refund?.entity;
      if (refund?.payment_id) {
        await db
          .update(bids)
          .set({
            status: "refunded",
            razorpayRefundId: refund.id,
            refundedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bids.razorpayPaymentId, refund.payment_id));
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, skipped: "unhandled_event" });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay webhook] handler error", err);
    // We already inserted webhookEvents; do NOT delete it — re-delivery will dedupe.
    return NextResponse.json(
      { error: { code: "handler_failed", message: "Internal error" } },
      { status: 500 },
    );
  }
}
