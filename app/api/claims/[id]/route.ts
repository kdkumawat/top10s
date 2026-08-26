import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bids, positions, listings } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/clerk";
import { errorResponse } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/claims/[id]
 * Returns the bid status (own only). The checkout page polls this every 2s
 * to know when the webhook has applied the claim.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const rows = await db
      .select({
        bid: bids,
        listing: listings,
      })
      .from(bids)
      .innerJoin(listings, eq(listings.id, bids.listingId))
      .where(eq(bids.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Claim not found" } },
        { status: 404 },
      );
    }
    const { bid, listing } = rows[0]!;
    if (bid.userId !== user.id) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Not your claim" } },
        { status: 403 },
      );
    }

    // If captured, also return the rank it landed on.
    let rank: number | null = null;
    if (bid.status === "captured") {
      const pos = await db
        .select({ rank: positions.rank })
        .from(positions)
        .where(eq(positions.listingId, bid.listingId))
        .limit(1);
      rank = pos[0]?.rank ?? null;
    }

    return NextResponse.json({
      claimId: bid.id,
      status: bid.status,
      targetRank: bid.targetRank,
      amount: bid.amount,
      currency: bid.currency,
      listing: { id: listing.id, slug: listing.slug, name: listing.name },
      rank,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
