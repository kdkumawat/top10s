import { sql, eq } from "drizzle-orm";
import { txDb } from "@/lib/db/tx";
import {
  bids,
  positions,
  positionHistory,
  activityFeed,
  listings,
  users,
} from "@/lib/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { MIN_EMPTY_BID_PAISE } from "@/lib/money";
import { sendEmail } from "@/lib/email/resend";
import {
  claimConfirmedTpl,
  pushedOutTpl,
  removedTpl,
} from "@/lib/email/templates";

/**
 * Atomic claim transaction. The single entry point for all board mutations
 * after payment capture.
 *
 * Flow (all in one transaction):
 *   1. pg_advisory_xact_lock(1)  — serialize board writes across processes.
 *   2. SELECT bid FOR UPDATE     — guard against double-claim from replays.
 *   3. SELECT target position FOR UPDATE.
 *   4. Re-validate: not self-bid, not frozen, sufficient amount.
 *   5. Shift ranks (targetRank..99) down by 1 when occupied and rank < 100.
 *   6. Place new listing at target rank.
 *   7. position_history rows (claimed, pushed_out, removed).
 *   8. activity_feed row.
 *   9. bids.status = 'captured'.
 *
 * Returns `{ status: "captured", rank, listingId }` on success.
 * Throws ConflictError / ForbiddenError / NotFoundError on invalid claims — caller refunds.
 */
export type ClaimInput = {
  bidId: string;
  paymentId: string;
};

export type ClaimResult =
  | { status: "captured"; rank: number; listingId: string }
  | { status: "noop"; reason: string };

export async function claim(input: ClaimInput): Promise<ClaimResult> {
  return await txDb().transaction(async (tx) => {
    // 1. Advisory lock — released on COMMIT/ROLLBACK.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1)`);

    // 2. Bid row (lock).
    const bidRows = await tx
      .select()
      .from(bids)
      .where(eq(bids.id, input.bidId))
      .for("update")
      .limit(1);
    if (bidRows.length === 0) {
      throw new ConflictError("bid_not_found", "Bid not found");
    }
    const bid = bidRows[0]!;
    if (bid.status === "captured") {
      return { status: "noop", reason: "already_captured" } as const;
    }
    if (bid.status !== "pending") {
      throw new ConflictError("bid_not_pending", `Bid is ${bid.status}`);
    }

    // 3. Target position (lock).
    const posRows = await tx
      .select()
      .from(positions)
      .where(eq(positions.rank, bid.targetRank))
      .for("update")
      .limit(1);
    if (posRows.length === 0) throw new NotFoundError("Position");
    const target = posRows[0]!;

    // 4a. Frozen check.
    if (target.frozen) {
      throw new ForbiddenError("Position is frozen");
    }

    // 4b. Self-bid check (re-validate under lock).
    if (target.listingId) {
      const currentListing = await tx
        .select({ userId: listings.userId })
        .from(listings)
        .where(eq(listings.id, target.listingId))
        .limit(1);
      if (currentListing[0]?.userId === bid.userId) {
        throw new ForbiddenError("You already hold this rank");
      }
    }

    // 4c. Amount check.
    const required =
      target.listingId === null ? MIN_EMPTY_BID_PAISE : target.currentBid + 1;
    if (bid.amount < required) {
      throw new ConflictError(
        "insufficient_bid",
        `Required ${required} paise, got ${bid.amount}`,
      );
    }

    // 5. Shift ranks down (if occupied and rank < 100), snapshotting #100 first.
    let pushedListingId: string | null = null;
    if (target.listingId !== null && target.rank < 100) {
      const before = (await tx.execute(
        sql`SELECT listing_id FROM positions WHERE rank = 100 FOR UPDATE`,
      )) as { listing_id: string | null }[];
      pushedListingId = before[0]?.listing_id ?? null;

      await tx.execute(sql`
        UPDATE positions p
        SET listing_id = src.listing_id,
            current_bid = src.current_bid,
            updated_at = now()
        FROM (
          SELECT rank, listing_id, current_bid
          FROM positions
          WHERE rank BETWEEN ${target.rank} AND 99
        ) src
        WHERE p.rank = src.rank + 1
      `);
    } else if (target.listingId !== null && target.rank === 100) {
      // Occupied #100 → overwritten by new claim; previous holder falls off.
      pushedListingId = target.listingId;
    }

    // 6. Place new listing at target rank.
    await tx
      .update(positions)
      .set({
        listingId: bid.listingId,
        currentBid: bid.amount,
        heldSince: target.heldSince ?? sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(positions.rank, target.rank));

    // 7. Position history.
    await tx.insert(positionHistory).values({
      rank: target.rank,
      listingId: bid.listingId,
      previousListingId: target.listingId,
      bidId: bid.id,
      userId: bid.userId,
      bidAmount: bid.amount,
      action: "claimed",
    });
    if (target.listingId) {
      await tx.insert(positionHistory).values({
        rank: target.rank,
        listingId: bid.listingId,
        previousListingId: target.listingId,
        bidId: bid.id,
        userId: bid.userId,
        bidAmount: target.currentBid,
        action: "pushed_out",
      });
    }
    if (pushedListingId && pushedListingId !== target.listingId) {
      await tx.insert(positionHistory).values({
        rank: 100,
        listingId: bid.listingId,
        previousListingId: pushedListingId,
        bidId: bid.id,
        userId: bid.userId,
        bidAmount: 0,
        action: "removed",
      });
    }

    // 8. Activity feed.
    await tx.insert(activityFeed).values({
      kind: "claim",
      listingId: bid.listingId,
      userId: bid.userId,
      rank: target.rank,
      amount: bid.amount,
      metadata: { paymentId: input.paymentId },
    });

    // 9. Mark bid captured.
    await tx
      .update(bids)
      .set({
        status: "captured",
        razorpayPaymentId: input.paymentId,
        appliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bids.id, bid.id));

    return {
      status: "captured",
      rank: target.rank,
      listingId: bid.listingId,
      wasOccupied: target.listingId !== null,
      previousListingId: target.listingId,
      pushedListingId,
      targetCurrentBid: target.currentBid,
    } as const;
  }).then(async (result) => {
    // Fire notifications after commit. Errors are logged but don't affect claim status.
    if (result.status === "captured") {
      await sendClaimEmails(result).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[claim] email send failed", err);
      });
    }
    return result;
  });
}

type EmailResult = {
  status: "captured";
  rank: number;
  listingId: string;
  wasOccupied: boolean;
  previousListingId: string | null;
  pushedListingId: string | null;
  targetCurrentBid: number;
};

async function sendClaimEmails(r: EmailResult): Promise<void> {
  const db = txDb();
  const targetUserIds = new Set<string>();
  // 1. Claimer.
  const bid = await db
    .select({ userId: bids.userId, amount: bids.amount, listingId: bids.listingId })
    .from(bids)
    .where(eq(bids.id, (await getClaimerBidId(r)) ?? ""))
    .limit(1);
  if (bid[0]) targetUserIds.add(bid[0].userId);
  // 2. Previous holder (if displaced) — different from claimer.
  if (r.previousListingId) {
    const prev = await db
      .select({ userId: listings.userId })
      .from(listings)
      .where(eq(listings.id, r.previousListingId))
      .limit(1);
    if (prev[0] && (!bid[0] || prev[0].userId !== bid[0].userId)) {
      targetUserIds.add(prev[0].userId);
    }
  }
  // 3. Pushed off (#100).
  if (r.pushedListingId && r.pushedListingId !== r.previousListingId) {
    const off = await db
      .select({ userId: listings.userId })
      .from(listings)
      .where(eq(listings.id, r.pushedListingId))
      .limit(1);
    if (off[0] && (!bid[0] || off[0].userId !== bid[0].userId)) {
      targetUserIds.add(off[0].userId);
    }
  }
  if (targetUserIds.size === 0) return;

  // Lookup users in one query.
  const userRows = await db
    .select()
    .from(users)
    .where(sql`${users.id} = ANY(${Array.from(targetUserIds)})`);
  const byId = new Map(userRows.map((u) => [u.id, u]));

  // Listings involved.
  const listingIds = new Set<string>();
  if (bid[0]) listingIds.add(bid[0].listingId);
  if (r.previousListingId) listingIds.add(r.previousListingId);
  if (r.pushedListingId) listingIds.add(r.pushedListingId);
  const listingRows = listingIds.size
    ? await db
        .select()
        .from(listings)
        .where(sql`${listings.id} = ANY(${Array.from(listingIds)})`)
    : [];
  const listingById = new Map(listingRows.map((l) => [l.id, l]));

  // 1. Claim confirmed → claimer.
  if (bid[0]) {
    const claimer = byId.get(bid[0].userId);
    const listing = listingById.get(bid[0].listingId);
    if (claimer && listing) {
      const tpl = claimConfirmedTpl({
        name: claimer.name,
        listingName: listing.name,
        rank: r.rank,
        amountPaise: bid[0].amount,
        listingSlug: listing.slug,
      });
      await sendEmail({ to: claimer.email, subject: tpl.subject, html: tpl.html });
    }
  }

  // 2. Pushed out → previous holder (if displaced, rank < 100).
  if (r.previousListingId && r.rank < 100) {
    const prev = listingById.get(r.previousListingId);
    const prevUser = prev ? byId.get(prev.userId) : null;
    const claimerListing = bid[0] ? listingById.get(bid[0].listingId) : null;
    if (prev && prevUser && claimerListing) {
      const tpl = pushedOutTpl({
        name: prevUser.name,
        listingName: prev.name,
        oldRank: r.rank,
        newRank: r.rank + 1,
        outbidBy: claimerListing.name,
        outbidByPaise: bid[0]?.amount ?? 0,
        listingSlug: prev.slug,
      });
      await sendEmail({ to: prevUser.email, subject: tpl.subject, html: tpl.html });
    }
  }

  // 3. Removed → pushedListingId's user.
  if (r.pushedListingId && r.pushedListingId !== r.previousListingId) {
    const off = listingById.get(r.pushedListingId);
    const offUser = off ? byId.get(off.userId) : null;
    const claimerListing = bid[0] ? listingById.get(bid[0].listingId) : null;
    if (off && offUser && claimerListing) {
      const tpl = removedTpl({
        name: offUser.name,
        listingName: off.name,
        oldRank: 100,
        outbidBy: claimerListing.name,
        outbidByPaise: bid[0]?.amount ?? 0,
        listingSlug: off.slug,
      });
      await sendEmail({ to: offUser.email, subject: tpl.subject, html: tpl.html });
    }
  }
}

async function getClaimerBidId(r: { rank: number; listingId: string }): Promise<string | null> {
  // Find the bid that just captured at this rank for this listing.
  // Look for the most recent captured bid matching (listingId, targetRank).
  const db = txDb();
  const rows = await db
    .select({ id: bids.id })
    .from(bids)
    .where(sql`${bids.listingId} = ${r.listingId} AND ${bids.targetRank} = ${r.rank} AND ${bids.status} = 'captured'`)
    .orderBy(sql`${bids.appliedAt} DESC NULLS LAST`)
    .limit(1);
  return rows[0]?.id ?? null;
}
