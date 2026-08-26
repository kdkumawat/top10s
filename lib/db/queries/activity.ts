import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityFeed, listings, users } from "@/lib/db/schema";

export type ActivityKind = "claim" | "outbid" | "pushed_out" | "removed";

export type ActivityItem = {
  id: number;
  kind: string;
  listingId: string | null;
  listingName: string | null;
  listingSlug: string | null;
  userName: string | null;
  rank: number | null;
  amount: number;
  createdAt: Date;
};

const MAX_LIMIT = 50;

export async function getRecentActivity(limit = 20): Promise<ActivityItem[]> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
  const rows = await db
    .select({
      id: activityFeed.id,
      kind: activityFeed.kind,
      listingId: activityFeed.listingId,
      listingName: listings.name,
      listingSlug: listings.slug,
      userName: users.name,
      rank: activityFeed.rank,
      amount: activityFeed.amount,
      createdAt: activityFeed.createdAt,
    })
    .from(activityFeed)
    .leftJoin(listings, eq(listings.id, activityFeed.listingId))
    .leftJoin(users, eq(users.id, activityFeed.userId))
    .orderBy(desc(activityFeed.createdAt))
    .limit(safeLimit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    listingId: r.listingId,
    listingName: r.listingName ?? null,
    listingSlug: r.listingSlug ?? null,
    userName: r.userName ?? null,
    rank: r.rank,
    amount: r.amount ?? 0,
    createdAt: r.createdAt,
  }));
}
