import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bids } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/clerk";
import { checkClaim } from "@/lib/board/validate";
import { claim } from "@/lib/board/claim";
import { createOrder, getPublicRazorpayKey } from "@/lib/razorpay/server";
import { getRazorpayMock } from "@/lib/env";
import { getOrSet } from "@/lib/redis/idempotency";
import { limitClaims } from "@/lib/redis/ratelimit";
import { errorResponse } from "@/lib/api/respond";
import { AppError, RateLimitedError } from "@/lib/errors";
import { MIN_EMPTY_BID_PAISE } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  listingId: z.string().uuid(),
  targetRank: z.number().int().min(1).max(100),
});

/**
 * POST /api/claims
 * Creates a pending bid + Razorpay order for the requested target rank.
 * Computes the required bid amount server-side (source of truth).
 *
 * In RAZORPAY_MOCK mode, invokes `claim()` synchronously and returns the
 * captured result — the checkout page just redirects to the listing/rank.
 *
 * Headers:
 *   Idempotency-Key: optional client-provided key (UUID); 300s dedupe.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // Rate limit by user id.
    const rl = await limitClaims(user.id);
    if (!rl.success) {
      throw new RateLimitedError(Math.max(0, rl.reset - Math.floor(Date.now() / 1000)));
    }

    // Idempotency-Key.
    const idemKey = req.headers.get("idempotency-key");

    const result = await getOrSet(
      `claims:${user.id}:${idemKey ?? crypto.randomUUID()}`,
      300,
      async () => {
        const body = createSchema.parse(await req.json());
        const check = await checkClaim({
          userId: user.id,
          listingId: body.listingId,
          targetRank: body.targetRank,
          amount: MIN_EMPTY_BID_PAISE, // pre-check, will be re-validated in claim()
        });

        const amountPaise = check.requiredAmount;

        // Create bid row.
        const inserted = await db
          .insert(bids)
          .values({
            userId: user.id,
            listingId: body.listingId,
            targetRank: body.targetRank,
            amount: amountPaise,
            currency: "INR",
            status: "pending",
          })
          .returning();
        const bid = inserted[0]!;

        // Create Razorpay order.
        const order = await createOrder({
          amount: amountPaise,
          currency: "INR",
          receipt: bid.id,
        });

        // Link order id to bid.
        await db
          .update(bids)
          .set({ razorpayOrderId: order.id, updatedAt: new Date() })
          .where(eq(bids.id, bid.id));

        const isMock = getRazorpayMock().RAZORPAY_MOCK;

        // Mock mode: fire claim() synchronously, no real payment, no webhook.
        if (isMock) {
          const paymentId = `mock_pay_${crypto.randomUUID()}`;
          const claimResult = await claim({ bidId: bid.id, paymentId });
          return {
            claimId: bid.id,
            bidId: bid.id,
            razorpayOrderId: order.id,
            amount: amountPaise,
            currency: "INR",
            key: getPublicRazorpayKey(),
            mock: true,
            status: claimResult.status,
            rank: "rank" in claimResult ? claimResult.rank : undefined,
          };
        }

        return {
          claimId: bid.id,
          bidId: bid.id,
          razorpayOrderId: order.id,
          amount: amountPaise,
          currency: "INR",
          key: getPublicRazorpayKey(),
          mock: false,
          status: "pending" as const,
        };
      },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }
    return errorResponse(err);
  }
}
