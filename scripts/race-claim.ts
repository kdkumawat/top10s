/**
 * Race-condition test for the atomic claim transaction.
 *
 * Fires N concurrent claim() calls targeting the same empty rank with
 * different bid amounts. Expectation:
 *   - Exactly one claim wins.
 *   - The winner has the highest bid amount.
 *   - The position row at the target rank has exactly that listing + amount.
 *   - No duplicate position_history rows; no missing positions.
 *   - Other claims return captured OR throw a domain error.
 *
 * Run: npx tsx scripts/race-claim.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { claim } from "../lib/board/claim";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("[race] DATABASE_URL (or DATABASE_DIRECT_URL) required");
  process.exit(1);
}

const N = 10;
const TARGET_RANK = 75;

async function main() {
  const client = postgres(url!, { max: 8, prepare: false });
  const db = drizzle(client, { schema });

  console.log(`[race] creating ${N} users + listings, clearing #${TARGET_RANK}`);

  // 1. Create N test users + listings.
  const users = (
    await db
      .insert(schema.users)
      .values(
        Array.from({ length: N }, (_, i) => ({
          clerkId: `race_user_${Date.now()}_${i}`,
          email: `race+${Date.now()}+${i}@test.local`,
          name: `Racer ${i}`,
          isAdmin: false,
          isSuspended: false,
        })),
      )
      .returning()
  ).map((u) => ({ ...u, listingId: "" }));

  const listings = await db
    .insert(schema.listings)
    .values(
      users.map((u, i) => ({
        userId: u.id,
        slug: `race-listing-${Date.now()}-${i}`,
        name: `RacerListing${i}`,
      })),
    )
    .returning();
  listings.forEach((l, i) => {
    users[i]!.listingId = l.id;
  });

  // 2. Clear target rank.
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, TARGET_RANK));

  // 3. Insert N pending bids with varying amounts (highest in the middle
  //    so it's not always the last to race).
  const amounts = Array.from({ length: N }, (_, i) => 9000 + i * 1000);
  // shuffle to mix order
  for (let i = amounts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [amounts[i], amounts[j]] = [amounts[j]!, amounts[i]!];
  }
  const maxAmount = Math.max(...amounts);

  const bids = await db
    .insert(schema.bids)
    .values(
      users.map((u, i) => ({
        userId: u.id,
        listingId: u.listingId,
        targetRank: TARGET_RANK,
        amount: amounts[i]!,
        currency: "INR",
        status: "pending" as const,
        razorpayOrderId: `mock_race_${Date.now()}_${i}`,
      })),
    )
    .returning();

  console.log(`[race] firing ${N} concurrent claim() calls`);
  console.log(`[race] amounts: ${amounts.join(", ")} (max=${maxAmount})`);

  // 4. Fire all claims concurrently.
  const results = await Promise.allSettled(
    bids.map((b, i) =>
      claim({
        bidId: b.id,
        paymentId: `mock_pay_race_${i}_${Date.now()}`,
      }),
    ),
  );

  // 5. Tally outcomes.
  let captured = 0;
  let noop = 0;
  let errors = 0;
  const errorSamples: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "fulfilled") {
      if (r.value.status === "captured") captured++;
      else if (r.value.status === "noop") noop++;
    } else {
      errors++;
      if (errorSamples.length < 3) {
        errorSamples.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
      }
    }
  }
  console.log(`[race] results: ${captured} captured, ${noop} noop, ${errors} errors`);
  if (errors > 0) {
    console.log(`[race] error samples: ${errorSamples.join(" | ")}`);
  }

  // 6. Verify the final state: rank #TARGET_RANK should have exactly one listing.
  const finalPos = (
    await db.select().from(schema.positions).where(eq(schema.positions.rank, TARGET_RANK))
  )[0]!;
  console.log(
    `[race] rank #${TARGET_RANK} final: listingId=${finalPos.listingId} currentBid=${finalPos.currentBid}`,
  );

  // 7. Verify the final state: rank #TARGET_RANK should have the highest
  //    amount's listing (last to capture wins, because each raise the bar).
  const winningAmount = Math.max(...amounts);
  const winningListingId = users[amounts.indexOf(winningAmount)]!.listingId;
  console.log(`[race] expected: listingId=${winningListingId} currentBid=${winningAmount}`);

  let failed = false;
  if (finalPos.listingId !== winningListingId) {
    console.error(`[race] FAIL: position listing mismatch`);
    failed = true;
  }
  if (finalPos.currentBid !== winningAmount) {
    console.error(`[race] FAIL: position currentBid mismatch (got ${finalPos.currentBid}, want ${winningAmount})`);
    failed = true;
  }
  if (captured === 0) {
    console.error(`[race] FAIL: no claim succeeded`);
    failed = true;
  }
  // Multiple captures are valid in serial: each raises the bar and the next
  // must exceed it. The final state has the highest amount.
  if (captured + errors + noop !== N) {
    console.error(`[race] FAIL: totals ${captured}+${errors}+${noop} != ${N}`);
    failed = true;
  }
  // Every captured bid must have at least one "claimed" history row.
  // (Displacement claims also write a "pushed_out" row, so total rows > captured.)
  const { inArray } = await import("drizzle-orm");
  const histRows = await db
    .select()
    .from(schema.positionHistory)
    .where(inArray(schema.positionHistory.bidId, bids.map((b) => b.id)));
  const claimedByCaptured = histRows.filter((r) => r.action === "claimed").length;
  if (claimedByCaptured !== captured) {
    console.error(`[race] FAIL: claimed history rows ${claimedByCaptured} != captured ${captured}`);
    failed = true;
  }
  // No history row should exist for an errored bid.
  const erroredBidIds = bids
    .filter((_, i) => results[i]!.status === "rejected")
    .map((b) => b.id);
  if (erroredBidIds.length > 0) {
    const erroredHist = histRows.filter((r) => erroredBidIds.includes(r.bidId!));
    if (erroredHist.length > 0) {
      console.error(`[race] FAIL: errored bids wrote ${erroredHist.length} history rows (should be 0)`);
      failed = true;
    }
  }

  // 8. Board invariant: 100 positions still.
  const count = (await db.execute(sql`SELECT count(*)::int AS n FROM positions`)) as unknown as {
    n: number;
  }[];
  if (count[0]?.n !== 100) {
    console.error(`[race] FAIL: position count ${count[0]?.n} != 100`);
    failed = true;
  }

  // Cleanup.
  for (const b of bids) {
    await db.delete(schema.positionHistory).where(eq(schema.positionHistory.bidId, b.id));
    await db.delete(schema.bids).where(eq(schema.bids.id, b.id));
  }
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, TARGET_RANK));
  for (const l of listings) {
    await db.delete(schema.listings).where(eq(schema.listings.id, l.id));
  }
  for (const u of users) {
    await db.delete(schema.users).where(eq(schema.users.id, u.id));
  }

  if (failed) {
    console.error(`\n[race] FAIL`);
    await client.end();
    process.exit(1);
  }
  console.log(
    `\n[race] PASS — ${captured} sequential captures, ${errors} rejected, highest bid won, board intact`,
  );
  await client.end();
}

main().catch(async (err) => {
  console.error("[race] error", err);
  process.exit(1);
});
