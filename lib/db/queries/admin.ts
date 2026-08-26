import "server-only";
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bids,
  listings,
  positionHistory,
  positions,
  users,
} from "@/lib/db/schema";

export type AdminUser = {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isSuspended: boolean;
  createdAt: Date;
  positions: number;
  bids: number;
};

export type AdminBid = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  listingId: string;
  listingName: string;
  listingSlug: string;
  targetRank: number;
  amount: number;
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  failureReason: string | null;
  createdAt: Date;
  appliedAt: Date | null;
  refundedAt: Date | null;
};

export async function getAllUsers(): Promise<AdminUser[]> {
  const userRows = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt));
  if (userRows.length === 0) return [];

  const posRows = await db
    .select({ userId: listings.userId, listingId: positions.listingId })
    .from(positions)
    .innerJoin(listings, eq(listings.id, positions.listingId))
    .where(isNotNull(positions.listingId));
  const bidsRows = await db
    .select({ userId: bids.userId })
    .from(bids);

  const posByUser = new Map<string, number>();
  for (const p of posRows) {
    posByUser.set(p.userId, (posByUser.get(p.userId) ?? 0) + 1);
  }
  const bidsByUser = new Map<string, number>();
  for (const b of bidsRows) {
    bidsByUser.set(b.userId, (bidsByUser.get(b.userId) ?? 0) + 1);
  }

  return userRows.map((u) => ({
    id: u.id,
    clerkId: u.clerkId,
    email: u.email,
    name: u.name,
    isAdmin: u.isAdmin,
    isSuspended: u.isSuspended,
    createdAt: u.createdAt,
    positions: posByUser.get(u.id) ?? 0,
    bids: bidsByUser.get(u.id) ?? 0,
  }));
}

export async function getAllBids(limit = 100): Promise<AdminBid[]> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 500);
  return db
    .select({
      id: bids.id,
      userId: bids.userId,
      userName: users.name,
      userEmail: users.email,
      listingId: bids.listingId,
      listingName: listings.name,
      listingSlug: listings.slug,
      targetRank: bids.targetRank,
      amount: bids.amount,
      status: bids.status,
      razorpayOrderId: bids.razorpayOrderId,
      razorpayPaymentId: bids.razorpayPaymentId,
      failureReason: bids.failureReason,
      createdAt: bids.createdAt,
      appliedAt: bids.appliedAt,
      refundedAt: bids.refundedAt,
    })
    .from(bids)
    .innerJoin(users, eq(users.id, bids.userId))
    .innerJoin(listings, eq(listings.id, bids.listingId))
    .orderBy(desc(bids.createdAt))
    .limit(safeLimit);
}

export async function getAdminPositionHistory(
  rank: number,
  limit = 50,
): Promise<
  Array<{
    id: number;
    action: string;
    bidAmount: number;
    createdAt: Date;
    userName: string | null;
    listingName: string | null;
  }>
> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
  return db
    .select({
      id: positionHistory.id,
      action: positionHistory.action,
      bidAmount: positionHistory.bidAmount,
      createdAt: positionHistory.createdAt,
      userName: users.name,
      listingName: listings.name,
    })
    .from(positionHistory)
    .leftJoin(users, eq(users.id, positionHistory.userId))
    .leftJoin(listings, eq(listings.id, positionHistory.listingId))
    .where(eq(positionHistory.rank, rank))
    .orderBy(desc(positionHistory.createdAt))
    .limit(safeLimit);
}
