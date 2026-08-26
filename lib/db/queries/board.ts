import "server-only";
import { eq, asc, isNotNull, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { positions, listings, listingCategories, categories } from "@/lib/db/schema";

export type BoardListing = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
  categorySlugs: string[];
};

export type BoardPosition = {
  rank: number;
  currentBid: number; // INR paise
  heldSince: Date | null;
  frozen: boolean;
  updatedAt: Date;
  listing: BoardListing | null;
};

export type Board = {
  positions: BoardPosition[];
  podium: [BoardPosition, BoardPosition, BoardPosition]; // #1, #2, #3
  grid: BoardPosition[]; // #4..#100
  counts: {
    occupied: number;
    empty: number;
    frozen: number;
  };
  maxUpdatedAt: Date;
};

const EMPTY_LISTING: BoardListing = {
  id: "",
  slug: "",
  name: "",
  logoUrl: null,
  websiteUrl: null,
  description: null,
  categorySlugs: [],
};

/**
 * Load the full 100-position board with joined listing + category data.
 * Returns 100 rows even when positions are empty (LEFT JOIN).
 */
export async function getBoard(): Promise<Board> {
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
    .orderBy(asc(positions.rank));

  // Collapse the many-to-one fan-out from listingCategories into BoardListing.
  const byRank = new Map<number, BoardPosition>();
  for (const r of rows) {
    let entry = byRank.get(r.rank);
    if (!entry) {
      entry = {
        rank: r.rank,
        currentBid: r.currentBid,
        heldSince: r.heldSince,
        frozen: r.frozen,
        updatedAt: r.updatedAt,
        listing: r.listingId
          ? {
              ...EMPTY_LISTING,
              id: r.listingId,
              slug: r.listingSlug!,
              name: r.listingName!,
              logoUrl: r.logoUrl,
              websiteUrl: r.websiteUrl,
              description: r.description,
            }
          : null,
      };
      byRank.set(r.rank, entry);
    }
    if (entry.listing && r.categorySlug) {
      entry.listing.categorySlugs.push(r.categorySlug);
    }
  }

  // Always return 100 positions, padding gaps with placeholders.
  const positions100: BoardPosition[] = [];
  for (let rank = 1; rank <= 100; rank++) {
    const found = byRank.get(rank);
    if (found) {
      positions100.push(found);
    } else {
      positions100.push({
        rank,
        currentBid: 0,
        heldSince: null,
        frozen: false,
        updatedAt: new Date(0),
        listing: null,
      });
    }
  }

  const [p1, p2, p3, ...grid] = positions100;
  const counts = positions100.reduce(
    (acc, p) => {
      if (p.listing) acc.occupied++;
      else acc.empty++;
      if (p.frozen) acc.frozen++;
      return acc;
    },
    { occupied: 0, empty: 0, frozen: 0 },
  );

  const maxUpdatedAt = positions100.reduce(
    (max, p) => (p.updatedAt > max ? p.updatedAt : max),
    new Date(0),
  );

  return {
    positions: positions100,
    podium: [p1, p2, p3],
    grid,
    counts,
    maxUpdatedAt,
  };
}
