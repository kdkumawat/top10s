import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  positions,
  listings,
  positionHistory,
  users,
  listingCategories,
  categories,
} from "@/lib/db/schema";
import type { BoardListing, BoardPosition } from "./board";

export type HistoryRow = {
  id: number;
  rank: number;
  action: string;
  bidAmount: number; // INR paise
  createdAt: Date;
  listingId: string | null;
  listingName: string | null;
  listingSlug: string | null;
  userId: string | null;
  userName: string | null;
  previousListingId: string | null;
  previousListingName: string | null;
  previousListingSlug: string | null;
};

/**
 * Load a single position with its current listing (if any) + category slugs.
 * Returns null if rank is out of range or row missing.
 */
export async function getPositionByRank(rank: number): Promise<BoardPosition | null> {
  if (!Number.isInteger(rank) || rank < 1 || rank > 100) return null;

  const rows = await db
    .select({
      rank: positions.rank,
      currentBid: positions.currentBid,
      heldSince: positions.heldSince,
      frozen: positions.frozen,
      updatedAt: positions.updatedAt,
      listingId: listings.id,
      listingSlug: listings.slug,
      listingName: listings.name,
      logoUrl: listings.logoUrl,
      websiteUrl: listings.websiteUrl,
      description: listings.description,
      categorySlug: categories.slug,
    })
    .from(positions)
    .leftJoin(listings, eq(listings.id, positions.listingId))
    .leftJoin(
      listingCategories,
      and(
        eq(listingCategories.listingId, listings.id),
        isNotNull(listings.id),
      ),
    )
    .leftJoin(categories, eq(categories.id, listingCategories.categoryId))
    .where(eq(positions.rank, rank));

  if (rows.length === 0) return null;

  const first = rows[0];
  const listing: BoardListing | null = first.listingId
    ? {
        id: first.listingId,
        slug: first.listingSlug!,
        name: first.listingName!,
        logoUrl: first.logoUrl,
        websiteUrl: first.websiteUrl,
        description: first.description,
        categorySlugs: [],
      }
    : null;

  for (const r of rows) {
    if (listing && r.categorySlug) listing.categorySlugs.push(r.categorySlug);
  }

  return {
    rank: first.rank,
    currentBid: first.currentBid,
    heldSince: first.heldSince,
    frozen: first.frozen,
    updatedAt: first.updatedAt,
    listing,
  };
}

/**
 * Load the last `limit` history rows for a rank, newest first.
 * Joins current + previous listing + acting user for display.
 */
export async function getPositionHistory(
  rank: number,
  limit = 20,
): Promise<HistoryRow[]> {
  if (!Number.isInteger(rank) || rank < 1 || rank > 100) return [];

  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);

  const rows = await db
    .select({
      id: positionHistory.id,
      rank: positionHistory.rank,
      action: positionHistory.action,
      bidAmount: positionHistory.bidAmount,
      createdAt: positionHistory.createdAt,
      listingId: positionHistory.listingId,
      listingName: listings.name,
      listingSlug: listings.slug,
      userId: positionHistory.userId,
      userName: users.name,
      previousListingId: positionHistory.previousListingId,
    })
    .from(positionHistory)
    .leftJoin(listings, eq(listings.id, positionHistory.listingId))
    .leftJoin(users, eq(users.id, positionHistory.userId))
    .where(eq(positionHistory.rank, rank))
    .orderBy(desc(positionHistory.createdAt))
    .limit(safeLimit);

  // Resolve previous-listing display names in a follow-up query.
  const prevIds = Array.from(
    new Set(
      rows.map((r) => r.previousListingId).filter((v): v is string => Boolean(v)),
    ),
  );

  const prevMap = new Map<string, { name: string; slug: string }>();
  if (prevIds.length > 0) {
    const prevRows = await db
      .select({
        id: listings.id,
        name: listings.name,
        slug: listings.slug,
      })
      .from(listings)
      .where(inArray(listings.id, prevIds));
    for (const p of prevRows) prevMap.set(p.id, { name: p.name, slug: p.slug });
  }

  return rows.map((r) => ({
    id: r.id,
    rank: r.rank,
    action: r.action,
    bidAmount: r.bidAmount,
    createdAt: r.createdAt,
    listingId: r.listingId,
    listingName: r.listingName,
    listingSlug: r.listingSlug,
    userId: r.userId,
    userName: r.userName,
    previousListingId: r.previousListingId,
    previousListingName:
      (r.previousListingId && prevMap.get(r.previousListingId)?.name) || null,
    previousListingSlug:
      (r.previousListingId && prevMap.get(r.previousListingId)?.slug) || null,
  }));
}
