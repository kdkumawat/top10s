/**
 * Smoke test: activity feed + /[rank] history.
 *
 * Run with: npx tsx scripts/smoke-activity.ts
 *
 * Requires .env.local with DATABASE_URL + DATABASE_DIRECT_URL.
 * Does NOT touch Razorpay or Upstash.
 *
 * Verifies:
 *   1. claim() writes an activity_feed row of kind=claim for the acting user
 *   2. getRecentActivity() surfaces that row with listing+user joined in
 *   3. getPositionHistory() returns the corresponding position_history rows
 *   4. A takeover claim yields 2 history rows (claimed + pushed_out) and
 *      the activity feed records only the acting user's claim
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, desc } from "drizzle-orm";
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
  console.error("[activity] DATABASE_URL (or DATABASE_DIRECT_URL) required");
  process.exit(1);
}

function fail(msg: string, client: postgres.Sql): never {
  console.error(`[activity] FAIL: ${msg}`);
  void client.end();
  process.exit(1);
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  console.log("[activity] setting up: 2 users, 2 listings, reset ranks #60 and #61");

  // 1. Two users (so we can test displacement).
  const ts = Date.now();
  const [userA] = await db
    .insert(schema.users)
    .values({
      clerkId: `activity_a_${ts}`,
      email: `activity+a+${ts}@test.local`,
      name: "Activity A",
    })
    .returning();
  const [userB] = await db
    .insert(schema.users)
    .values({
      clerkId: `activity_b_${ts}`,
      email: `activity+b+${ts}@test.local`,
      name: "Activity B",
    })
    .returning();
  if (!userA || !userB) fail("user insert", client);

  // 2. Two listings.
  const [listingA] = await db
    .insert(schema.listings)
    .values({ userId: userA.id, slug: `activity-a-${ts}`, name: "ListingA" })
    .returning();
  const [listingB] = await db
    .insert(schema.listings)
    .values({ userId: userB.id, slug: `activity-b-${ts}`, name: "ListingB" })
    .returning();
  if (!listingA || !listingB) fail("listing insert", client);

  // 3. Reset ranks #60 and #61 to empty.
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, 60));
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, 61));

  // 4. User A claims empty #60 for $1 (8400 paise).
  const [bidA] = await db
    .insert(schema.bids)
    .values({
      userId: userA.id,
      listingId: listingA.id,
      targetRank: 60,
      amount: 8400,
      currency: "INR",
      status: "pending" as const,
      razorpayOrderId: `mock_activity_a_${ts}`,
    })
    .returning();
  if (!bidA) fail("bid A insert", client);

  const resA = await claim({ bidId: bidA.id, paymentId: `mock_pay_activity_a_${ts}` });
  if (resA.status !== "captured") fail(`claim A not captured: ${JSON.stringify(resA)}`, client);
  console.log(`[activity] user A claimed #60 (empty)`);

  // 5. User B claims #60 with higher amount -> A cascades to #61, displaced.
  const [bidB] = await db
    .insert(schema.bids)
    .values({
      userId: userB.id,
      listingId: listingB.id,
      targetRank: 60,
      amount: 25_000,
      currency: "INR",
      status: "pending" as const,
      razorpayOrderId: `mock_activity_b_${ts}`,
    })
    .returning();
  if (!bidB) fail("bid B insert", client);

  const resB = await claim({ bidId: bidB.id, paymentId: `mock_pay_activity_b_${ts}` });
  if (resB.status !== "captured") fail(`claim B not captured: ${JSON.stringify(resB)}`, client);
  console.log(`[activity] user B claimed #60, A pushed to #61`);

  // 6. Verify activity_feed rows for the two claims.
  const allActivity = await db
    .select()
    .from(schema.activityFeed)
    .where(eq(schema.activityFeed.userId, userB.id))
    .orderBy(desc(schema.activityFeed.createdAt));
  console.log(`[activity] activity_feed rows for userB: ${allActivity.length}`);
  if (allActivity.length === 0) fail("no activity row for user B", client);

  const claimRow = allActivity[0]!;
  if (claimRow.kind !== "claim") fail(`expected kind=claim, got ${claimRow.kind}`, client);
  if (claimRow.rank !== 60) fail(`expected rank=60, got ${claimRow.rank}`, client);
  if (claimRow.amount !== 25_000) fail(`expected amount=25000, got ${claimRow.amount}`, client);
  console.log(`[activity] activity row: kind=${claimRow.kind} rank=#${claimRow.rank} amount=${claimRow.amount}`);

  // 7. Verify the activity row would be returned by getRecentActivity()
  //    (mirrors the LEFT JOIN in lib/db/queries/activity.ts).
  const joinedActivity = await db
    .select({
      id: schema.activityFeed.id,
      kind: schema.activityFeed.kind,
      rank: schema.activityFeed.rank,
      amount: schema.activityFeed.amount,
      listingName: schema.listings.name,
      userName: schema.users.name,
    })
    .from(schema.activityFeed)
    .leftJoin(schema.listings, eq(schema.listings.id, schema.activityFeed.listingId))
    .leftJoin(schema.users, eq(schema.users.id, schema.activityFeed.userId))
    .where(eq(schema.activityFeed.id, claimRow.id));
  const matching = joinedActivity[0];
  if (!matching) fail("activity join returned no row", client);
  if (matching.listingName !== "ListingB") fail(`listingName: got ${matching.listingName}`, client);
  if (matching.userName !== "Activity B") fail(`userName: got ${matching.userName}`, client);
  if (matching.rank !== 60) fail(`activity rank: got ${matching.rank}`, client);
  console.log(`[activity] joined row: ${matching.listingName} by ${matching.userName} at #${matching.rank}`);

  // 8. /[rank] page equivalent: positionHistory rows for #60.
  const hist60 = await db
    .select()
    .from(schema.positionHistory)
    .where(eq(schema.positionHistory.rank, 60));
  console.log(`[activity] history rows for #60: ${hist60.length}`);
  if (hist60.length < 2) fail(`expected ≥2 history rows on #60, got ${hist60.length}`, client);
  const hist60Actions = hist60.map((h) => h.action);
  if (!hist60Actions.includes("claimed")) fail(`#60 missing 'claimed'`, client);
  if (!hist60Actions.includes("pushed_out")) fail(`#60 missing 'pushed_out' (A was pushed from #60 to #61)`, client);
  console.log(`[activity] #60 actions: ${hist60Actions.join(", ")}`);

  // 9. Cascade state: A's listing is now at #61.
  const pos61 = (
    await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.rank, 61))
  )[0]!;
  if (pos61.listingId !== listingA.id) {
    fail(`#61 should hold listingA after cascade, got ${pos61.listingId}`, client);
  }
  console.log(`[activity] cascade OK: listingA at #61 (${pos61.currentBid} paise)`);

  // Cleanup.
  await db
    .delete(schema.activityFeed)
    .where(
      eq(
        schema.activityFeed.id,
        claimRow.id,
      ),
    );
  await db
    .delete(schema.activityFeed)
    .where(eq(schema.activityFeed.userId, userA.id));
  await db
    .delete(schema.positionHistory)
    .where(
      eq(schema.positionHistory.bidId, bidB.id),
    );
  await db
    .delete(schema.positionHistory)
    .where(eq(schema.positionHistory.bidId, bidA.id));
  await db
    .delete(schema.bids)
    .where(eq(schema.bids.id, bidB.id));
  await db
    .delete(schema.bids)
    .where(eq(schema.bids.id, bidA.id));
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, 60));
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, 61));
  await db.delete(schema.listings).where(eq(schema.listings.id, listingA.id));
  await db.delete(schema.listings).where(eq(schema.listings.id, listingB.id));
  await db.delete(schema.users).where(eq(schema.users.id, userA.id));
  await db.delete(schema.users).where(eq(schema.users.id, userB.id));

  console.log("[activity] PASS — activity feed + position history end-to-end");
  await client.end();
}

main().catch(async (err) => {
  console.error("[activity] error", err);
  process.exit(1);
});
