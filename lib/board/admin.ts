import "server-only";
import { eq, sql } from "drizzle-orm";
import { txDb } from "@/lib/db/tx";
import { db } from "@/lib/db";
import {
  bids,
  listings,
  positionHistory,
  positions,
  users,
} from "@/lib/db/schema";
import { refundPayment } from "@/lib/razorpay/server";
import { ConflictError, NotFoundError } from "@/lib/errors";

/**
 * Toggle the frozen flag on a position. Inserts a history row recording the action.
 */
export async function setPositionFrozen(
  rank: number,
  frozen: boolean,
): Promise<{ rank: number; frozen: boolean }> {
  if (!Number.isInteger(rank) || rank < 1 || rank > 100) {
    throw new ConflictError("invalid_rank", "Rank must be 1-100");
  }
  return await txDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(positions)
      .where(eq(positions.rank, rank))
      .for("update")
      .limit(1);
    if (rows.length === 0) throw new NotFoundError("Position");
    await tx
      .update(positions)
      .set({ frozen, updatedAt: new Date() })
      .where(eq(positions.rank, rank));
    await tx.insert(positionHistory).values({
      rank,
      listingId: rows[0]!.listingId,
      bidId: null,
      userId: null,
      bidAmount: 0,
      action: frozen ? "frozen" : "unfrozen",
    });
    return { rank, frozen };
  });
}

/**
 * Clear a position. Sets listingId=null, currentBid=0, heldSince=null (gap stays).
 * Inserts a positionHistory row with action=removed.
 */
export async function clearPosition(rank: number): Promise<{ rank: number }> {
  if (!Number.isInteger(rank) || rank < 1 || rank > 100) {
    throw new ConflictError("invalid_rank", "Rank must be 1-100");
  }
  return await txDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(positions)
      .where(eq(positions.rank, rank))
      .for("update")
      .limit(1);
    if (rows.length === 0) throw new NotFoundError("Position");
    const prev = rows[0]!;
    if (!prev.listingId) {
      return { rank };
    }
    await tx
      .update(positions)
      .set({
        listingId: null,
        currentBid: 0,
        heldSince: null,
        updatedAt: new Date(),
      })
      .where(eq(positions.rank, rank));
    await tx.insert(positionHistory).values({
      rank,
      listingId: prev.listingId,
      previousListingId: prev.listingId,
      bidId: null,
      userId: null,
      bidAmount: prev.currentBid,
      action: "removed",
    });
    return { rank };
  });
}

/**
 * Refund a captured bid. Calls Razorpay refund, marks the bid refunded,
 * clears the position if the bid is currently on the board, and inserts
 * a refunded history row.
 */
export async function refundBid(bidId: string): Promise<{
  bidId: string;
  refundId: string;
  rank: number | null;
}> {
  return await txDb().transaction(async (tx) => {
    const bidRows = await tx
      .select()
      .from(bids)
      .where(eq(bids.id, bidId))
      .for("update")
      .limit(1);
    if (bidRows.length === 0) throw new NotFoundError("Bid");
    const bid = bidRows[0]!;
    if (bid.status !== "captured") {
      throw new ConflictError("not_captured", `Bid is ${bid.status}`);
    }
    if (!bid.razorpayPaymentId) {
      throw new ConflictError("no_payment_id", "Bid has no payment id");
    }

    // Call Razorpay refund outside the DB transaction? For simplicity do it
    // inline — the network call is the only failure mode and the bid stays
    // in `captured` state if it throws, allowing a retry.
    const refund = await refundPayment({ paymentId: bid.razorpayPaymentId });

    await tx
      .update(bids)
      .set({
        status: "refunded",
        razorpayRefundId: refund.id,
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bids.id, bid.id));

    // If this bid's listing currently occupies a position, clear it.
    const posRows = await tx
      .select()
      .from(positions)
      .where(eq(positions.listingId, bid.listingId))
      .for("update")
      .limit(1);
    let rank: number | null = null;
    if (posRows.length > 0) {
      const pos = posRows[0]!;
      rank = pos.rank;
      await tx
        .update(positions)
        .set({
          listingId: null,
          currentBid: 0,
          heldSince: null,
          updatedAt: new Date(),
        })
        .where(eq(positions.rank, pos.rank));
      await tx.insert(positionHistory).values({
        rank: pos.rank,
        listingId: bid.listingId,
        previousListingId: bid.listingId,
        bidId: bid.id,
        userId: bid.userId,
        bidAmount: bid.amount,
        action: "refunded",
      });
    }

    return { bidId: bid.id, refundId: refund.id, rank };
  });
}

/**
 * Toggle a user's suspended flag.
 */
export async function setUserSuspended(
  userId: string,
  suspended: boolean,
): Promise<{ id: string; isSuspended: boolean }> {
  const rows = await db
    .update(users)
    .set({ isSuspended: suspended })
    .where(eq(users.id, userId))
    .returning({ id: users.id, isSuspended: users.isSuspended });
  if (rows.length === 0) throw new NotFoundError("User");
  return rows[0]!;
}
