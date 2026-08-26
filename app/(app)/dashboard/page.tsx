import Link from "next/link";
import { Plus, ImageIcon, Crown, History as HistoryIcon, Check, AlertCircle, Clock, RefreshCw } from "@/lib/icons";
import { requireUser } from "@/lib/auth/clerk";
import { getListingsByUser } from "@/lib/db/queries/listings";
import { getMyPositions, getMyBids, getDashboardSummary } from "@/lib/db/queries/dashboard";
import { formatUsdFromPaise } from "@/lib/money";
import { formatRelative } from "@/lib/format-relative";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [listings, positions, bids, summary] = await Promise.all([
    getListingsByUser(user.id),
    getMyPositions(user.id),
    getMyBids(user.id, 30),
    getDashboardSummary(user.id),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-fg">Your dashboard</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Manage listings, monitor your positions, and review bid history.
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/new">
              <Plus className="size-4" /> New listing
            </Link>
          </Button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryStat label="Listings" value={summary.listings} />
          <SummaryStat label="On the board" value={summary.positions} accent="accent" />
          <SummaryStat label="Bids captured" value={summary.bidsCaptured} />
          <SummaryStat label="Bids pending" value={summary.bidsPending} accent="muted" />
          <SummaryStat label="Refunded/failed" value={summary.bidsRefunded} accent="danger" />
        </dl>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl text-fg">Your positions</h2>
        {positions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-fg-muted">
            No active positions. Claim a spot to start ranking.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {positions.map((p) => (
              <li
                key={p.rank}
                className={cn(
                  "rounded-lg border border-border bg-surface p-4",
                  p.frozen && "opacity-60",
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-md font-mono text-sm tabular-nums",
                      p.rank === 1
                        ? "bg-gold/15 text-gold"
                        : p.rank === 2
                          ? "bg-fg-muted/10 text-fg-muted"
                          : p.rank === 3
                            ? "bg-urgency/10 text-urgency"
                            : "bg-surface-elevated text-fg",
                    )}
                  >
                    #{p.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${p.listingSlug}`}
                      className="truncate font-medium text-fg hover:text-primary"
                    >
                      {p.listingName}
                    </Link>
                    <p className="font-mono text-xs text-accent tabular-nums">
                      {formatUsdFromPaise(p.currentBid)}
                    </p>
                  </div>
                </div>
                {p.heldSince && (
                  <p className="mt-2 font-mono text-xs text-fg-subtle">
                    held {formatRelative(p.heldSince)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl text-fg">Your listings</h2>
        {listings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
            <ImageIcon className="mx-auto mb-3 size-10 text-fg-subtle" />
            <h3 className="font-display text-xl text-fg">No listings yet</h3>
            <p className="mt-1 text-sm text-fg-muted">Create one to get on the board.</p>
            <div className="mt-4">
              <Button asChild>
                <Link href="/dashboard/new">
                  <Plus className="size-4" /> Create your first listing
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <li key={l.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  {l.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.logoUrl}
                      alt={l.name}
                      className="size-12 rounded-md object-cover"
                    />
                  ) : (
                    <div className="grid size-12 place-items-center rounded-md bg-surface-elevated text-fg-muted">
                      {l.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{l.name}</p>
                    <p className="truncate text-xs text-fg-subtle">/{l.slug}</p>
                  </div>
                </div>
                {l.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-fg-muted">
                    {l.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-fg-subtle">
                  <span>{l.status}</span>
                  <time dateTime={l.createdAt.toISOString()}>
                    {l.createdAt.toLocaleDateString()}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl text-fg">Bid history</h2>
        {bids.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-fg-muted">
            No bids yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-fg-subtle">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Listing</th>
                  <th className="px-3 py-2 font-medium">Rank</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bids.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-mono text-xs text-fg-subtle">
                      {formatRelative(b.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/${b.listingSlug}`}
                        className="text-fg hover:text-primary"
                      >
                        {b.listingName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {b.currentRank ? (
                        <Link
                          href={`/${b.currentRank}`}
                          className="text-primary hover:underline"
                        >
                          #{b.currentRank}
                        </Link>
                      ) : (
                        <span className="text-fg-muted">#{b.targetRank}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-accent">
                      {formatUsdFromPaise(b.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <BidStatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "accent" | "danger" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 font-display text-2xl tabular-nums",
          accent === "accent" && "text-accent",
          accent === "danger" && "text-danger",
          accent === "muted" && "text-fg-muted",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function BidStatusBadge({ status }: { status: string }) {
  const meta: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
    captured: {
      icon: <Check className="size-3" aria-hidden />,
      className: "border-accent/40 bg-accent/10 text-accent",
      label: "Captured",
    },
    pending: {
      icon: <Clock className="size-3" aria-hidden />,
      className: "border-urgency/40 bg-urgency/10 text-urgency",
      label: "Pending",
    },
    failed: {
      icon: <AlertCircle className="size-3" aria-hidden />,
      className: "border-danger/40 bg-danger/10 text-danger",
      label: "Failed",
    },
    refunded: {
      icon: <RefreshCw className="size-3" aria-hidden />,
      className: "border-fg-muted/40 bg-fg-muted/10 text-fg-muted",
      label: "Refunded",
    },
  };
  const m = meta[status] ?? {
    icon: <HistoryIcon className="size-3" aria-hidden />,
    className: "border-border bg-surface text-fg-muted",
    label: status,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest",
        m.className,
      )}
    >
      {m.icon}
      {m.label}
    </span>
  );
}
