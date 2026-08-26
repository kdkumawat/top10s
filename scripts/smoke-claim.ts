/**
 * Smoke test: atomic claim transaction against a real DB.
 *
 * Run with: npx tsx scripts/smoke-claim.ts
 *
 * Requires .env.local with DATABASE_URL + DATABASE_DIRECT_URL.
 * Does NOT touch Razorpay (mock mode) or Upstash.
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
  console.error("[smoke] DATABASE_URL (or DATABASE_DIRECT_URL) required");
  process.exit(1);
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  console.log("[smoke] setting up: create test user + listing, reset rank #50");

  // 1. Create a test user.
  const userRows = await db
    .insert(schema.users)
    .values({
      clerkId: `smoke_user_${Date.now()}`,
      email: `smoke+${Date.now()}@test.local`,
      name: "Smoke Tester",
      isAdmin: false,
      isSuspended: false,
    })
    .returning();
  const user = userRows[0]!;

  // 2. Create a test listing.
  const listingRows = await db
    .insert(schema.listings)
    .values({
      userId: user.id,
      slug: `smoke-listing-${Date.now()}`,
      name: "SmokeListing",
    })
    .returning();
  const listing = listingRows[0]!;

  // 3. Reset rank #50 to empty.
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, 50));

  // 4. Insert a pending bid.
  const bidRows = await db
    .insert(schema.bids)
    .values({
      userId: user.id,
      listingId: listing.id,
      targetRank: 50,
      amount: 8400,
      currency: "INR",
      status: "pending" as const,
      razorpayOrderId: `mock_smoke_${Date.now()}`,
    })
    .returning();
  const bid = bidRows[0]!;
  console.log(`[smoke] bid created: ${bid.id}, target=#50, amount=${bid.amount}`);

  // 5. Invoke claim().
  const result = await claim({ bidId: bid.id, paymentId: `mock_pay_smoke_${Date.now()}` });
  console.log(`[smoke] claim() result:`, result);

  if (result.status !== "captured") {
    console.error("[smoke] FAIL: expected captured");
    await client.end();
    process.exit(1);
  }
  if (result.rank !== 50) {
    console.error(`[smoke] FAIL: expected rank 50, got ${result.rank}`);
    await client.end();
    process.exit(1);
  }

  // 6. Verify the position was updated.
  const pos = await db
    .select()
    .from(schema.positions)
    .where(eq(schema.positions.rank, 50))
    .limit(1);
  const p = pos[0]!;
  console.log(
    `[smoke] rank #50: listingId=${p.listingId === listing.id ? "✓" : "✗"} (${p.listingId}) currentBid=${p.currentBid}`,
  );
  if (p.listingId !== listing.id) {
    console.error("[smoke] FAIL: position not updated to listing");
    await client.end();
    process.exit(1);
  }
  if (p.currentBid !== 8400) {
    console.error(`[smoke] FAIL: currentBid expected 8400, got ${p.currentBid}`);
    await client.end();
    process.exit(1);
  }

  // 7. Verify history rows.
  const history = await db
    .select()
    .from(schema.positionHistory)
    .where(eq(schema.positionHistory.bidId, bid.id));
  console.log(`[smoke] position_history rows: ${history.length}`);
  const actions = history.map((h) => h.action).sort();
  if (!actions.includes("claimed")) {
    console.error("[smoke] FAIL: no claimed history row");
    await client.end();
    process.exit(1);
  }
  console.log(`[smoke] actions: ${actions.join(", ")}`);

  // 8. Verify activity feed.
  const allActivity = await db
    .select()
    .from(schema.activityFeed)
    .where(eq(schema.activityFeed.userId, user.id));
  console.log(`[smoke] activity_feed rows for user: ${allActivity.length}`);

  // 9. Verify bid is captured.
  const bidAfter = (await db
    .select()
    .from(schema.bids)
    .where(eq(schema.bids.id, bid.id))
    .limit(1))[0]!;
  console.log(`[smoke] bid status: ${bidAfter.status}, appliedAt: ${bidAfter.appliedAt ? "✓" : "✗"}`);
  if (bidAfter.status !== "captured") {
    console.error("[smoke] FAIL: bid not captured");
    await client.end();
    process.exit(1);
  }

  // 10. Idempotency: re-run claim, expect noop.
  const replay = await claim({ bidId: bid.id, paymentId: "replay" });
  console.log(`[smoke] replay result:`, replay);
  if (replay.status !== "noop") {
    console.error("[smoke] FAIL: expected noop on replay");
    await client.end();
    process.exit(1);
  }

  // Cleanup: clear test data.
  await db.delete(schema.activityFeed).where(eq(schema.activityFeed.userId, user.id));
  await db.delete(schema.positionHistory).where(eq(schema.positionHistory.bidId, bid.id));
  await db.delete(schema.bids).where(eq(schema.bids.id, bid.id));
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, 50));
  await db.delete(schema.listings).where(eq(schema.listings.id, listing.id));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));

  console.log("[smoke] PASS — atomic claim transaction works end-to-end");
  await client.end();
}

main().catch(async (err) => {
  console.error("[smoke] error", err);
  process.exit(1);
});
