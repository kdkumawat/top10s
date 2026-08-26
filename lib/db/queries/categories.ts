import "server-only";
import { and, asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  listingCategories,
  listings,
  positions,
} from "@/lib/db/schema";

export type CategoryWithCount = {
  id: string;
  slug: string;
  name: string;
  count: number;
};

/**
 * List all categories with their occupied listing count (listings on the board).
 * Categories with 0 listings are still returned.
 */
export async function getAllCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const rows = await db.execute<{
    id: string;
    slug: string;
    name: string;
    count: number;
  }>(sql`
    SELECT
      c.id::text AS id,
      c.slug,
      c.name,
      COUNT(DISTINCT CASE
        WHEN l.id IS NOT NULL
          AND p.listing_id IS NOT NULL
          AND l.status = 'active'
        THEN l.id
      END)::int AS count
    FROM categories c
    LEFT JOIN listing_categories lc ON lc.category_id = c.id
    LEFT JOIN listings l
      ON l.id = lc.listing_id
      AND l.status = 'active'
    LEFT JOIN positions p ON p.listing_id = l.id
    GROUP BY c.id, c.slug, c.name
    ORDER BY count DESC, c.name ASC
  `);
  // postgres-js execute() with generic types returns rows directly as the array.
  return (rows as unknown as {
    id: string;
    slug: string;
    name: string;
    count: number;
  }[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    count: r.count,
  }));
}

export type CategoryTopRow = {
  rank: number;
  currentBid: number; // INR paise
  heldSince: Date | null;
  listingId: string;
  listingSlug: string;
  listingName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
};

/**
 * Top N occupied listings in a given category, ordered by global rank ascending.
 * Returns [] for unknown slug. limit defaults to 10, max 100.
 */
export async function getCategoryTop(
  slug: string,
  limit = 10,
): Promise<CategoryTopRow[]> {
  if (!slug) return [];
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);

  const rows = await db
    .select({
      rank: positions.rank,
      currentBid: positions.currentBid,
      heldSince: positions.heldSince,
      listingId: listings.id,
      listingSlug: listings.slug,
      listingName: listings.name,
      logoUrl: listings.logoUrl,
      websiteUrl: listings.websiteUrl,
      description: listings.description,
    })
    .from(categories)
    .innerJoin(listingCategories, eq(listingCategories.categoryId, categories.id))
    .innerJoin(listings, eq(listings.id, listingCategories.listingId))
    .innerJoin(positions, eq(positions.listingId, listings.id))
    .where(
      and(
        eq(categories.slug, slug),
        eq(listings.status, "active"),
        isNotNull(positions.listingId),
      ),
    )
    .orderBy(asc(positions.rank))
    .limit(safeLimit);

  return rows;
}

/**
 * Get a single category by slug (for header/metadata). Null if unknown.
 */
export async function getCategoryBySlug(slug: string): Promise<{
  id: string;
  slug: string;
  name: string;
} | null> {
  if (!slug) return null;
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
    })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}
