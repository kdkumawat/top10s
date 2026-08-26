import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  smallint,
  bigserial,
  primaryKey,
  index,
  uniqueIndex,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ============================================================
 * Enums
 * ============================================================ */

export const listingStatus = pgEnum("listing_status", [
  "active",
  "suspended",
  "deleted",
]);

export const bidStatus = pgEnum("bid_status", [
  "pending",
  "captured",
  "failed",
  "refunded",
]);

export const historyAction = pgEnum("history_action", [
  "claimed",
  "outbid",
  "pushed_out",
  "removed",
  "refunded",
  "frozen",
  "unfrozen",
]);

/* ============================================================
 * users
 * ============================================================ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    isAdmin: boolean("is_admin").notNull().default(false),
    isSuspended: boolean("is_suspended").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_clerk_id_idx").on(t.clerkId),
    index("users_email_idx").on(t.email),
  ],
);

/* ============================================================
 * categories (seeded)
 * ============================================================ */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.slug)],
);

/* ============================================================
 * listings
 * ============================================================ */

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),
    description: text("description"),
    status: listingStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("listings_slug_idx").on(t.slug),
    index("listings_user_id_idx").on(t.userId),
    index("listings_status_idx").on(t.status),
  ],
);

/* ============================================================
 * listingCategories (M2M)
 * ============================================================ */

export const listingCategories = pgTable(
  "listing_categories",
  {
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.listingId, t.categoryId] }),
    index("listing_categories_category_id_idx").on(t.categoryId),
  ],
);

/* ============================================================
 * positions — the 100-slot board (must always have exactly 100 rows)
 * ============================================================ */

export const positions = pgTable(
  "positions",
  {
    rank: smallint("rank").primaryKey(),
    listingId: uuid("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    currentBid: integer("current_bid").notNull().default(0), // INR paise
    heldSince: timestamp("held_since", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    frozen: boolean("frozen").notNull().default(false),
  },
  (t) => [
    check("positions_rank_range", sql`${t.rank} BETWEEN 1 AND 100`),
    check(
      "positions_bid_nonneg",
      sql`${t.currentBid} >= 0`,
    ),
    index("positions_listing_id_idx").on(t.listingId),
  ],
);

/* ============================================================
 * bids — payment ledger
 * ============================================================ */

export const bids = pgTable(
  "bids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    targetRank: smallint("target_rank").notNull(),
    amount: integer("amount").notNull(), // INR paise
    currency: text("currency").notNull().default("INR"),
    status: bidStatus("status").notNull().default("pending"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    razorpayRefundId: text("razorpay_refund_id"),
    failureReason: text("failure_reason"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bids_razorpay_order_id_idx").on(t.razorpayOrderId),
    uniqueIndex("bids_razorpay_payment_id_idx").on(t.razorpayPaymentId),
    index("bids_user_id_idx").on(t.userId),
    index("bids_listing_id_idx").on(t.listingId),
    index("bids_status_idx").on(t.status),
    index("bids_target_rank_idx").on(t.targetRank),
    check("bids_target_rank_range", sql`${t.targetRank} BETWEEN 1 AND 100`),
    check("bids_amount_positive", sql`${t.amount} > 0`),
  ],
);

/* ============================================================
 * positionHistory — audit / display
 * ============================================================ */

export const positionHistory = pgTable(
  "position_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rank: smallint("rank").notNull(),
    listingId: uuid("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    previousListingId: uuid("previous_listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    bidId: uuid("bid_id").references(() => bids.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    bidAmount: integer("bid_amount").notNull().default(0),
    action: historyAction("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("position_history_rank_created_idx").on(t.rank, t.createdAt),
    index("position_history_listing_id_idx").on(t.listingId),
    index("position_history_bid_id_idx").on(t.bidId),
  ],
);

/* ============================================================
 * webhookEvents — idempotency
 * ============================================================ */

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_provider_event_idx").on(t.provider, t.eventId)],
);

/* ============================================================
 * activityFeed — live activity widget
 * ============================================================ */

export const activityFeed = pgTable(
  "activity_feed",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    listingId: uuid("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    rank: smallint("rank"),
    amount: integer("amount"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("activity_feed_created_at_idx").on(t.createdAt),
    index("activity_feed_listing_id_idx").on(t.listingId),
  ],
);

/* ============================================================
 * Relations (for Drizzle relational queries)
 * ============================================================ */

export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings),
  bids: many(bids),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  user: one(users, { fields: [listings.userId], references: [users.id] }),
  categories: many(listingCategories),
  position: one(positions, {
    fields: [listings.id],
    references: [positions.listingId],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  listings: many(listingCategories),
}));

export const listingCategoriesRelations = relations(listingCategories, ({ one }) => ({
  listing: one(listings, {
    fields: [listingCategories.listingId],
    references: [listings.id],
  }),
  category: one(categories, {
    fields: [listingCategories.categoryId],
    references: [categories.id],
  }),
}));

export const positionsRelations = relations(positions, ({ one }) => ({
  listing: one(listings, {
    fields: [positions.listingId],
    references: [listings.id],
  }),
}));

export const bidsRelations = relations(bids, ({ one }) => ({
  user: one(users, { fields: [bids.userId], references: [users.id] }),
  listing: one(listings, { fields: [bids.listingId], references: [listings.id] }),
}));

/* ============================================================
 * Inferred types
 * ============================================================ */

export type User = typeof users.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Bid = typeof bids.$inferSelect;
export type PositionHistory = typeof positionHistory.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type ActivityFeedItem = typeof activityFeed.$inferSelect;
