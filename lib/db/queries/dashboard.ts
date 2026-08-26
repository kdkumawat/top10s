import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { bids, listings, positions, users } from "@/lib/db/schema";

export type MyPosition = {
  rank: number;
  currentBid: number; // INR paise
  heldSince: Date | null;
  frozen: boolean;
  listingId: string;
  listingSlug: string;
  listingName: string;
  logoUrl: string | null;
};

export type MyBid = {
  id: string;
  targetRank: number;
  amount: number; // INR paise
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  failureReason: string | null;
  createdAt: Date;
  appliedAt: Date | null;
  refundedAt: Date | null;
  listingId: string;
  listingSlug: string;
  listingName: string;
  currentRank: number | null;
};

/**
 * Listings owned by `userId` that currently occupy a rank.
 */
export async function getMyPositions(userId: string): Promise<MyPosition[]> {
  return db
    .select({
      rank: positions.rank,
      currentBid: positions.currentBid,
      heldSince: positions.heldSince,
      frozen: positions.frozen,
      listingId: listings.id,
      listingSlug: listings.slug,
      listingName: listings.name,
      logoUrl: listings.logoUrl,
    })
    .from(positions)
    .innerJoin(listings, eq(listings.id, positions.listingId))
    .where(and(eq(listings.userId, userId), isNotNull(positions.listingId)))
    .orderBy(positions.rank);
}

/**
 * Bids created by `userId`, newest first.
 * Joins the listing for display; the current position (if any) is resolved
 * via a second pass to keep the SQL readable.
 */
export async function getMyBids(userId: string, limit = 50): Promise<MyBid[]> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);

  const rows = await db
    .select({
      id: bids.id,
      targetRank: bids.targetRank,
      amount: bids.amount,
      status: bids.status,
      razorpayOrderId: bids.razorpayOrderId,
      razorpayPaymentId: bids.razorpayPaymentId,
      failureReason: bids.failureReason,
      createdAt: bids.createdAt,
      appliedAt: bids.appliedAt,
      refundedAt: bids.refundedAt,
      listingId: listings.id,
      listingSlug: listings.slug,
      listingName: listings.name,
    })
    .from(bids)
    .innerJoin(listings, eq(listings.id, bids.listingId))
    .where(eq(bids.userId, userId))
    .orderBy(desc(bids.createdAt))
    .limit(safeLimit);

  // Resolve current rank for captured bids (their listing may be on the board).
  const listingIds = Array.from(new Set(rows.map((r) => r.listingId)));
  const currentRanks = new Map<string, number>();
  if (listingIds.length > 0) {
    const posRows = await db
      .select({ listingId: positions.listingId, rank: positions.rank })
      .from(positions)
      .where(isNotNull(positions.listingId));
    for (const p of posRows) {
      if (p.listingId && listingIds.includes(p.listingId)) {
        currentRanks.set(p.listingId, p.rank);
      }
    }
  }

  return rows.map((r) => ({
    ...r,
    currentRank: currentRanks.get(r.listingId) ?? null,
  }));
}

/**
 * Aggregate counts for the dashboard summary header.
 */
export async function getDashboardSummary(userId: string): Promise<{
  listings: number;
  positions: number;
  bidsCaptured: number;
  bidsPending: number;
  bidsRefunded: number;
}> {
  const all = await db
    .select({
      status: bids.status,
      listingUserId: listings.userId,
    })
    .from(bids)
    .innerJoin(listings, eq(listings.id, bids.listingId))
    .where(eq(listings.userId, userId));

  const listingRows = await db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.userId, userId));

  const posRows = await db
    .select({ listingId: positions.listingId })
    .from(positions)
    .where(isNotNull(positions.listingId));
  const onBoard = new Set(posRows.map((p) => p.listingId).filter(Boolean));

  return {
    listings: listingRows.length,
    positions: listingRows.filter((l) => onBoard.has(l.id)).length,
    bidsCaptured: all.filter((b) => b.status === "captured").length,
    bidsPending: all.filter((b) => b.status === "pending").length,
    bidsRefunded: all.filter(
      (b) => b.status === "refunded" || b.status === "failed",
    ).length,
  };
}
