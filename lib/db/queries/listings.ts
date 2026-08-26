import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, listingCategories, categories } from "@/lib/db/schema";
import { slugify, withSuffix } from "@/lib/slug";
import { NotFoundError, ConflictError } from "@/lib/errors";

export type ListingRow = typeof listings.$inferSelect;
export type NewListingInput = {
  userId: string;
  name: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  categorySlugs?: string[];
};

/** Generate a unique slug for a listing owned by `excludeUserId` (optional). */
export async function generateUniqueListingSlug(
  name: string,
  excludeListingId?: string,
): Promise<string> {
  const base = slugify(name) || "listing";
  // Try base, then -2, -3, ... up to 50.
  for (let n = 1; n <= 50; n++) {
    const candidate = withSuffix(base, n);
    const rows = await db
      .select({ id: listings.id })
      .from(listings)
      .where(
        excludeListingId
          ? and(eq(listings.slug, candidate), ne(listings.id, excludeListingId))
          : eq(listings.slug, candidate),
      )
      .limit(1);
    if (rows.length === 0) return candidate;
  }
  throw new ConflictError("slug_collision", "Could not generate unique slug");
}

/** Resolve category slugs to IDs. Unknown slugs are skipped. */
async function resolveCategoryIds(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(sql`${categories.slug} = ANY(${slugs})`);
  return rows.map((r) => r.id);
}

export async function createListing(input: NewListingInput): Promise<ListingRow> {
  const slug = await generateUniqueListingSlug(input.name);
  const inserted = await db
    .insert(listings)
    .values({
      userId: input.userId,
      slug,
      name: input.name,
      websiteUrl: input.websiteUrl ?? null,
      logoUrl: input.logoUrl ?? null,
      description: input.description ?? null,
      status: "active",
    })
    .returning();
  const row = inserted[0]!;

  if (input.categorySlugs && input.categorySlugs.length > 0) {
    const catIds = await resolveCategoryIds(input.categorySlugs);
    if (catIds.length > 0) {
      await db
        .insert(listingCategories)
        .values(catIds.map((categoryId) => ({ listingId: row.id, categoryId })));
    }
  }
  return row;
}

export async function getListingById(id: string): Promise<ListingRow | null> {
  const rows = await db
    .select()
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getListingBySlug(slug: string): Promise<ListingRow | null> {
  const rows = await db
    .select()
    .from(listings)
    .where(eq(listings.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function getListingsByUser(userId: string): Promise<ListingRow[]> {
  return db
    .select()
    .from(listings)
    .where(and(eq(listings.userId, userId), ne(listings.status, "deleted")))
    .orderBy(desc(listings.createdAt));
}

export type UpdateListingInput = {
  name?: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  categorySlugs?: string[];
};

export async function updateListing(
  id: string,
  ownerId: string,
  patch: UpdateListingInput,
): Promise<ListingRow> {
  const existing = await getListingById(id);
  if (!existing) throw new NotFoundError("Listing");
  if (existing.userId !== ownerId) throw new NotFoundError("Listing");
  if (existing.status === "deleted") throw new NotFoundError("Listing");

  const updates: Partial<typeof listings.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.name !== undefined && patch.name !== existing.name) {
    updates.name = patch.name;
    updates.slug = await generateUniqueListingSlug(patch.name, id);
  }
  if (patch.websiteUrl !== undefined) updates.websiteUrl = patch.websiteUrl;
  if (patch.logoUrl !== undefined) updates.logoUrl = patch.logoUrl;
  if (patch.description !== undefined) updates.description = patch.description;

  if (Object.keys(updates).length > 1) {
    // updatedAt alone doesn't count as a meaningful change
    const updated = await db
      .update(listings)
      .set(updates)
      .where(eq(listings.id, id))
      .returning();
    return updated[0]!;
  }

  if (patch.categorySlugs !== undefined) {
    await db.delete(listingCategories).where(eq(listingCategories.listingId, id));
    const catIds = await resolveCategoryIds(patch.categorySlugs);
    if (catIds.length > 0) {
      await db
        .insert(listingCategories)
        .values(catIds.map((categoryId) => ({ listingId: id, categoryId })));
    }
  }

  return (await getListingById(id))!;
}

/** Soft-delete: mark status='deleted', keep the row for history. */
export async function deleteListing(id: string, ownerId: string): Promise<void> {
  const existing = await getListingById(id);
  if (!existing) throw new NotFoundError("Listing");
  if (existing.userId !== ownerId) throw new NotFoundError("Listing");
  if (existing.status === "deleted") return;
  await db
    .update(listings)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(listings.id, id));
}
