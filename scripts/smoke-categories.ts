/**
 * Smoke test: category queries.
 *
 * Run with: npx tsx scripts/smoke-categories.ts
 *
 * Requires .env.local with DATABASE_URL + DATABASE_DIRECT_URL.
 * Does NOT touch Razorpay or Upstash.
 *
 * Verifies:
 *   1. getAllCategoriesWithCounts() returns all 8 seeded categories
 *   2. Count of a category increases after we occupy a listing in it
 *   3. getCategoryTop("ai", 10) returns AI listings ordered by rank asc
 *   4. getCategoryTop("unknown-slug") returns []
 *   5. getCategoryBySlug("ai") returns the AI row; unknown → null
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, asc } from "drizzle-orm";
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
  console.error("[categories] DATABASE_URL required");
  process.exit(1);
}

function fail(msg: string, client: postgres.Sql): never {
  console.error(`[categories] FAIL: ${msg}`);
  void client.end();
  process.exit(1);
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  console.log("[categories] getting baseline counts");

  // 1. Categories list before any test data.
  const catsBefore = await db
    .select()
    .from(schema.categories)
    .orderBy(asc(schema.categories.name));
  console.log(`[categories] seeded categories: ${catsBefore.length}`);
  if (catsBefore.length < 8) fail(`expected ≥8 seeded categories, got ${catsBefore.length}`, client);
  const aiCat = catsBefore.find((c) => c.slug === "ai");
  if (!aiCat) fail("missing 'ai' category seed", client);
  const startupsCat = catsBefore.find((c) => c.slug === "startups");
  if (!startupsCat) fail("missing 'startups' category seed", client);

  // 2. Mirror getAllCategoriesWithCounts() — count of AI listings currently on the board.
  const baselineCount = (
    await db.execute<{ count: number }>(/* sql */ `
      SELECT COUNT(DISTINCT l.id)::int AS count
      FROM listings l
      JOIN listing_categories lc ON lc.listing_id = l.id
      JOIN categories c ON c.id = lc.category_id
      JOIN positions p ON p.listing_id = l.id
      WHERE c.slug = 'ai'
        AND l.status = 'active'
        AND p.listing_id IS NOT NULL
    `)
  ) as unknown as { count: number }[];
  const baselineAi = baselineCount[0]?.count ?? 0;
  console.log(`[categories] baseline AI occupied: ${baselineAi}`);

  // 3. Set up: 2 users, 2 listings (one AI, one startups), claim #70 + #71.
  const ts = Date.now();
  const [userA] = await db
    .insert(schema.users)
    .values({
      clerkId: `cat_a_${ts}`,
      email: `cat+a+${ts}@test.local`,
      name: "CatA",
    })
    .returning();
  const [userB] = await db
    .insert(schema.users)
    .values({
      clerkId: `cat_b_${ts}`,
      email: `cat+b+${ts}@test.local`,
      name: "CatB",
    })
    .returning();
  if (!userA || !userB) fail("user insert", client);

  const [listingAi] = await db
    .insert(schema.listings)
    .values({ userId: userA.id, slug: `cat-ai-${ts}`, name: "AIListing" })
    .returning();
  const [listingStartups] = await db
    .insert(schema.listings)
    .values({ userId: userB.id, slug: `cat-su-${ts}`, name: "SUListing" })
    .returning();
  if (!listingAi || !listingStartups) fail("listing insert", client);

  await db.insert(schema.listingCategories).values([
    { listingId: listingAi.id, categoryId: aiCat!.id },
    { listingId: listingStartups.id, categoryId: startupsCat!.id },
  ]);

  for (const r of [70, 71] as const) {
    await db
      .update(schema.positions)
      .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
      .where(eq(schema.positions.rank, r));
  }

  const [bidA] = await db
    .insert(schema.bids)
    .values({
      userId: userA.id,
      listingId: listingAi.id,
      targetRank: 70,
      amount: 8400,
      currency: "INR",
      status: "pending" as const,
      razorpayOrderId: `mock_cat_a_${ts}`,
    })
    .returning();
  const [bidB] = await db
    .insert(schema.bids)
    .values({
      userId: userB.id,
      listingId: listingStartups.id,
      targetRank: 71,
      amount: 8400,
      currency: "INR",
      status: "pending" as const,
      razorpayOrderId: `mock_cat_b_${ts}`,
    })
    .returning();
  if (!bidA || !bidB) fail("bid insert", client);

  const resA = await claim({ bidId: bidA.id, paymentId: `mock_pay_cat_a_${ts}` });
  if (resA.status !== "captured") fail(`claim A not captured: ${JSON.stringify(resA)}`, client);
  const resB = await claim({ bidId: bidB.id, paymentId: `mock_pay_cat_b_${ts}` });
  if (resB.status !== "captured") fail(`claim B not captured: ${JSON.stringify(resB)}`, client);
  console.log(`[categories] occupied: AIListing at #70, SUListing at #71`);

  // 4. Mirror getAllCategoriesWithCounts() again.
  const afterCount = (
    await db.execute<{ count: number }>(/* sql */ `
      SELECT COUNT(DISTINCT l.id)::int AS count
      FROM listings l
      JOIN listing_categories lc ON lc.listing_id = l.id
      JOIN categories c ON c.id = lc.category_id
      JOIN positions p ON p.listing_id = l.id
      WHERE c.slug = 'ai'
        AND l.status = 'active'
        AND p.listing_id IS NOT NULL
    `)
  ) as unknown as { count: number }[];
  const afterAi = afterCount[0]?.count ?? 0;
  console.log(`[categories] after AI occupied: ${afterAi}`);
  if (afterAi !== baselineAi + 1) {
    fail(`AI count should be ${baselineAi + 1}, got ${afterAi}`, client);
  }

  // 5. Mirror getCategoryTop("ai", 10): listings in AI category, on board, sorted by rank asc.
  const topAi = await db
    .select({
      rank: schema.positions.rank,
      listingSlug: schema.listings.slug,
      listingName: schema.listings.name,
    })
    .from(schema.categories)
    .innerJoin(schema.listingCategories, eq(schema.listingCategories.categoryId, schema.categories.id))
    .innerJoin(schema.listings, eq(schema.listings.id, schema.listingCategories.listingId))
    .innerJoin(schema.positions, eq(schema.positions.listingId, schema.listings.id))
    .where(eq(schema.categories.slug, "ai"))
    .orderBy(asc(schema.positions.rank))
    .limit(10);
  console.log(`[categories] top 10 AI: ${topAi.map((r) => `${r.listingName}@#${r.rank}`).join(", ")}`);
  if (topAi.length === 0) fail("expected at least the just-claimed AI listing", client);
  const ourAi = topAi.find((r) => r.listingSlug === listingAi.slug);
  if (!ourAi) fail("our AI listing missing from top", client);
  if (ourAi.rank !== 70) fail(`our AI rank expected 70, got ${ourAi.rank}`, client);

  // 6. Top of 'unknown-slug' → empty.
  const topUnknown = await db
    .select()
    .from(schema.categories)
    .innerJoin(schema.listingCategories, eq(schema.listingCategories.categoryId, schema.categories.id))
    .innerJoin(schema.listings, eq(schema.listings.id, schema.listingCategories.listingId))
    .innerJoin(schema.positions, eq(schema.positions.listingId, schema.listings.id))
    .where(eq(schema.categories.slug, "does-not-exist-xyz"))
    .limit(10);
  if (topUnknown.length !== 0) fail(`unknown slug should return [], got ${topUnknown.length}`, client);
  console.log(`[categories] unknown-slug top: 0 rows ✓`);

  // 7. getCategoryBySlug mirrors.
  const ai = await db
    .select({ slug: schema.categories.slug, name: schema.categories.name })
    .from(schema.categories)
    .where(eq(schema.categories.slug, "ai"))
    .limit(1);
  if (!ai[0] || ai[0].name !== "AI") fail(`category by slug 'ai' wrong: ${JSON.stringify(ai[0])}`, client);
  console.log(`[categories] getCategoryBySlug('ai') = ${ai[0]?.name} ✓`);

  // Cleanup.
  await db.delete(schema.activityFeed).where(eq(schema.activityFeed.userId, userA.id));
  await db.delete(schema.activityFeed).where(eq(schema.activityFeed.userId, userB.id));
  await db.delete(schema.positionHistory).where(eq(schema.positionHistory.bidId, bidA.id));
  await db.delete(schema.positionHistory).where(eq(schema.positionHistory.bidId, bidB.id));
  await db.delete(schema.bids).where(eq(schema.bids.id, bidA.id));
  await db.delete(schema.bids).where(eq(schema.bids.id, bidB.id));
  await db.delete(schema.listingCategories).where(eq(schema.listingCategories.listingId, listingAi.id));
  await db.delete(schema.listingCategories).where(eq(schema.listingCategories.listingId, listingStartups.id));
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, 70));
  await db
    .update(schema.positions)
    .set({ listingId: null, currentBid: 0, heldSince: null, updatedAt: new Date() })
    .where(eq(schema.positions.rank, 71));
  await db.delete(schema.listings).where(eq(schema.listings.id, listingAi.id));
  await db.delete(schema.listings).where(eq(schema.listings.id, listingStartups.id));
  await db.delete(schema.users).where(eq(schema.users.id, userA.id));
  await db.delete(schema.users).where(eq(schema.users.id, userB.id));

  console.log("[categories] PASS — category queries work end-to-end");
  await client.end();
}

main().catch(async (err) => {
  console.error("[categories] error", err);
  process.exit(1);
});
