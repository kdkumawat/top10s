import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { positions, listings } from "@/lib/db/schema";
import { ForbiddenError, NotFoundError, ConflictError } from "@/lib/errors";
import { MIN_EMPTY_BID_PAISE } from "@/lib/money";

/**
 * Pre-flight validation for a claim. Pure DB reads (no writes) — the atomic
 * transaction in `claim()` re-validates with row locks before mutating.
 */
export type ClaimCheckInput = {
  userId: string;
  listingId: string;
  targetRank: number;
  amount: number; // INR paise
};

export type ClaimCheckResult = {
  rank: number;
  listing: typeof listings.$inferSelect;
  currentBid: number;
  isEmpty: boolean;
  isFrozen: boolean;
  requiredAmount: number;
};

export async function checkClaim(input: ClaimCheckInput): Promise<ClaimCheckResult> {
  if (!Number.isInteger(input.targetRank) || input.targetRank < 1 || input.targetRank > 100) {
    throw new ConflictError("invalid_rank", "Rank must be between 1 and 100");
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new ConflictError("invalid_amount", "Amount must be a positive integer (paise)");
  }

  const listing = await db
    .select()
    .from(listings)
    .where(eq(listings.id, input.listingId))
    .limit(1);
  if (listing.length === 0) throw new NotFoundError("Listing");
  if (listing[0]!.status === "deleted") throw new NotFoundError("Listing");

  const pos = await db
    .select()
    .from(positions)
    .where(eq(positions.rank, input.targetRank))
    .limit(1);
  if (pos.length === 0) throw new NotFoundError("Position");
  const p = pos[0]!;

  // Self-bid: listing already at target rank belongs to the same user.
  if (p.listingId && p.listingId !== input.listingId) {
    const current = await db
      .select({ userId: listings.userId })
      .from(listings)
      .where(eq(listings.id, p.listingId))
      .limit(1);
    if (current[0]?.userId === input.userId) {
      throw new ForbiddenError("You already hold this rank");
    }
  }

  const isEmpty = p.listingId === null;
  const requiredAmount = isEmpty ? MIN_EMPTY_BID_PAISE : p.currentBid + 1;
  if (input.amount < requiredAmount) {
    throw new ConflictError(
      "insufficient_bid",
      `Minimum required: ${requiredAmount} paise`,
    );
  }

  return {
    rank: p.rank,
    listing: listing[0]!,
    currentBid: p.currentBid,
    isEmpty,
    isFrozen: p.frozen,
    requiredAmount,
  };
}

/** Helper: ensure the global 100-row invariant holds. Called inside claim(). */
export async function assertBoardSize(): Promise<void> {
  const row = (await db.execute(
    sql`SELECT count(*)::int AS n FROM positions`,
  )) as unknown as { n: number }[];
  if (row[0]?.n !== 100) {
    throw new Error(`Board invariant violated: ${row[0]?.n} rows (expected 100)`);
  }
}

/** Helper: count listings the user already holds. Used for self-bid matrix. */
export async function userHoldsRanks(
  userId: string,
  excludeRank?: number,
): Promise<number[]> {
  const rows = await db
    .select({ rank: positions.rank })
    .from(positions)
    .innerJoin(listings, eq(listings.id, positions.listingId))
    .where(eq(listings.userId, userId));
  return rows.map((r) => r.rank).filter((r) => r !== excludeRank);
}
