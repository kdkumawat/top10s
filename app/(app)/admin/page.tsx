import { asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bids, positions, users, listings } from "@/lib/db/schema";
import { Trophy, AlertCircle, History as HistoryIcon, Flag } from "@/lib/icons";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [
    occupied,
    frozen,
    userCount,
    suspendedCount,
    pendingBids,
    capturedBids,
    refundedBids,
    failedBids,
    recentCaptures,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(positions)
      .where(isNotNull(positions.listingId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(positions)
      .where(eq(positions.frozen, true)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.isSuspended, true)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bids)
      .where(eq(bids.status, "pending")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bids)
      .where(eq(bids.status, "captured")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bids)
      .where(eq(bids.status, "refunded")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bids)
      .where(eq(bids.status, "failed")),
    db
      .select({
        id: bids.id,
        amount: bids.amount,
        targetRank: bids.targetRank,
        createdAt: bids.createdAt,
        userName: users.name,
        listingName: listings.name,
      })
      .from(bids)
      .innerJoin(users, eq(users.id, bids.userId))
      .innerJoin(listings, eq(listings.id, bids.listingId))
      .where(eq(bids.status, "captured"))
      .orderBy(sql`${bids.appliedAt} DESC NULLS LAST`)
      .limit(10),
  ]);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Trophy className="size-4" />} label="Occupied" value={occupied[0]?.count ?? 0} />
        <Stat icon={<AlertCircle className="size-4" />} label="Frozen" value={frozen[0]?.count ?? 0} accent="danger" />
        <Stat icon={<HistoryIcon className="size-4" />} label="Pending bids" value={pendingBids[0]?.count ?? 0} accent="muted" />
        <Stat icon={<Flag className="size-4" />} label="Suspended users" value={suspendedCount[0]?.count ?? 0} accent="danger" />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg text-fg">Bid ledger</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Captured" value={capturedBids[0]?.count ?? 0} accent="accent" compact />
          <Stat label="Refunded" value={refundedBids[0]?.count ?? 0} compact />
          <Stat label="Failed" value={failedBids[0]?.count ?? 0} accent="danger" compact />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg text-fg">Recent captures</h2>
        {recentCaptures.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-surface p-6 text-center text-sm text-fg-muted">
            No captures yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {recentCaptures.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono text-fg-muted">#{c.targetRank}</span>
                <span className="truncate text-fg">{c.listingName}</span>
                <span className="ml-auto font-mono text-xs text-fg-subtle">
                  {c.userName ?? "—"}
                </span>
                <span className="w-20 text-right font-mono text-xs text-accent tabular-nums">
                  ₹{(c.amount / 100).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  icon,
  compact,
}: {
  label: string;
  value: number;
  accent?: "accent" | "danger" | "muted";
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface ${compact ? "px-3 py-2" : "px-4 py-3"}`}
    >
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
        {icon}
        {label}
      </p>
      <p
        className={`mt-1 font-display tabular-nums ${compact ? "text-lg" : "text-2xl"} ${
          accent === "accent"
            ? "text-accent"
            : accent === "danger"
              ? "text-danger"
              : accent === "muted"
                ? "text-fg-muted"
                : "text-fg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
