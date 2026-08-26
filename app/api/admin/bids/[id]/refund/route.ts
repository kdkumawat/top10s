import { NextResponse, type NextRequest } from "next/server";
import { refundBid } from "@/lib/board/admin";
import { errorResponse } from "@/lib/api/respond";
import { withAdmin } from "@/lib/api/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bids/[id]/refund
 * Refunds a captured bid (Razorpay) and clears the position if the bid's
 * listing currently occupies one.
 */
export const POST = withAdmin<{ id: string }>(async (_req, { id }) => {
  try {
    const result = await refundBid(id);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
