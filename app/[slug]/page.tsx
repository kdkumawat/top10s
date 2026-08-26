import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatUsdFromPaise } from "@/lib/money";
import { formatRelative } from "@/lib/format-relative";
import { getPositionByRank, getPositionHistory } from "@/lib/db/queries/positions";
import { getListingBySlug } from "@/lib/db/queries/listings";
import { db } from "@/lib/db";
import { positions, positionHistory, listings, users } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  Crown,
  Snowflake,
  History as HistoryIcon,
  ExternalLink,
  Trophy,
  Medal,
} from "@/lib/icons";
import { ShareButton } from "@/components/ui/share-button";

export const revalidate = 60;
export const dynamicParams = true;

const RANK_LABELS: Record<number, string> = { 1: "gold", 2: "silver", 3: "bronze" };

function parseRank(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > 100) return null;
  return n;
}

async function loadRankView(rank: number) {
  const [pos, history] = await Promise.all([
    getPositionByRank(rank),
    getPositionHistory(rank, 20),
  ]);
  if (!pos) return null;
  return { pos, history };
}

async function loadListingView(slug: string) {
  const listing = await getListingBySlug(slug);
  if (!listing) return null;
  // Current position (if any).
  const posRows = await db
    .select()
    .from(positions)
    .where(eq(positions.listingId, listing.id))
    .limit(1);
  const pos = posRows[0] ?? null;
  // Last 20 history rows for this listing.
  const history = await db
    .select({
      id: positionHistory.id,
      rank: positionHistory.rank,
      action: positionHistory.action,
      bidAmount: positionHistory.bidAmount,
      createdAt: positionHistory.createdAt,
      userName: users.name,
    })
    .from(positionHistory)
    .leftJoin(users, eq(users.id, positionHistory.userId))
    .where(eq(positionHistory.listingId, listing.id))
    .orderBy(desc(positionHistory.createdAt))
    .limit(20);
  return { listing, pos, history };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rank = parseRank(slug);
  if (rank !== null) {
    const view = await loadRankView(rank);
    if (!view) return { title: "Rank not found · top10s.lol" };
    const { pos } = view;
    const title = pos.listing
      ? `#${rank} ${pos.listing.name} · top10s.lol`
      : `#${rank} open · top10s.lol`;
    const description = pos.listing
      ? `Currently ranked #${rank} on top10s.lol.`
      : `Spot #${rank} is open. Beat the bid to claim it.`;
    return { title, description, openGraph: { title, description } };
  }
  const view = await loadListingView(slug);
  if (!view) return { title: "Listing not found · top10s.lol" };
  const { listing, pos } = view;
  const title = pos
    ? `${listing.name} · #${pos.rank} · top10s.lol`
    : `${listing.name} · top10s.lol`;
  const description =
    listing.description ?? `${listing.name} on top10s.lol.`;
  return { title, description, openGraph: { title, description } };
}

export default async function SlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rank = parseRank(slug);
  if (rank !== null) {
    const view = await loadRankView(rank);
    if (!view) notFound();
    const { pos, history } = view;
    return <RankView rank={rank} pos={pos} history={history} />;
  }

  const view = await loadListingView(slug);
  if (!view) notFound();
  const { listing, pos, history } = view;
  return <ListingView listing={listing} pos={pos} history={history} />;
}

/* ============================================================
 * Rank view (was /[rank])
 * ============================================================ */

function RankView({
  rank,
  pos,
  history,
}: {
  rank: number;
  pos: NonNullable<Awaited<ReturnType<typeof loadRankView>>>["pos"];
  history: NonNullable<Awaited<ReturnType<typeof loadRankView>>>["history"];
}) {
  const usd = formatUsdFromPaise(pos.currentBid);
  const isPodium = rank >= 1 && rank <= 3;
  const rankLabel = RANK_LABELS[rank];
  const checkoutHref = `/checkout/new?rank=${rank}`;
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${rank}`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-primary"
      >
        ← Back to board
      </Link>

      <header className="mb-8 flex items-start gap-4">
        <div
          className={cn(
            "grid size-16 shrink-0 place-items-center rounded-lg border",
            rank === 1
              ? "border-gold bg-gold/10 text-gold"
              : rank === 2
                ? "border-fg-muted/40 bg-fg-muted/10 text-fg-muted"
                : rank === 3
                  ? "border-urgency/40 bg-urgency/10 text-urgency"
                  : "border-border bg-surface text-fg",
          )}
        >
          {rank === 1 ? (
            <Crown className="size-7" aria-hidden />
          ) : rank === 2 || rank === 3 ? (
            <Medal className="size-7" aria-hidden />
          ) : (
            <Trophy className="size-6" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-widest text-fg-subtle">
            Rank {rank} {rankLabel ? `· ${rankLabel}` : ""}
          </p>
          <h1 className="mt-1 font-display text-3xl text-fg sm:text-4xl">
            {pos.listing ? pos.listing.name : `Spot #${rank} open`}
          </h1>
          {pos.listing?.description && (
            <p className="mt-2 text-sm text-fg-muted">{pos.listing.description}</p>
          )}
          {pos.listing?.websiteUrl && (
            <a
              href={pos.listing.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {pos.listing.websiteUrl.replace(/^https?:\/\//, "")}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
        <ShareButton url={shareUrl} label={`#${rank}`} />
      </header>

      <section
        aria-label="Position state"
        className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <Stat label="Current bid" value={pos.listing ? usd : "—"} mono />
        <Stat
          label="Held since"
          value={pos.heldSince ? formatRelative(pos.heldSince) : "—"}
        />
        <Stat
          label="Status"
          value={pos.frozen ? "Frozen" : pos.listing ? "Occupied" : "Empty"}
          accent={pos.frozen ? "danger" : pos.listing ? "accent" : "muted"}
          icon={pos.frozen ? <Snowflake className="size-3.5" aria-hidden /> : null}
        />
      </section>

      <div className="mb-10 flex flex-wrap items-center gap-3">
        <Link
          href={checkoutHref}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 font-display text-sm text-primary-fg transition-colors hover:bg-primary-hover"
        >
          {pos.listing ? `Take #${rank}` : `Claim #${rank} for $1`}
        </Link>
        {pos.listing?.categorySlugs && pos.listing.categorySlugs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {pos.listing.categorySlugs.map((slug) => (
              <Link
                key={slug}
                href={`/c/${slug}`}
                className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-fg-muted hover:border-primary hover:text-primary"
              >
                {slug}
              </Link>
            ))}
          </div>
        )}
      </div>

      <HistorySection rank={rank} history={history} isPodium={isPodium} />
    </main>
  );
}

/* ============================================================
 * Listing view (was /[slug])
 * ============================================================ */

function ListingView({
  listing,
  pos,
  history,
}: {
  listing: NonNullable<Awaited<ReturnType<typeof loadListingView>>>["listing"];
  pos: NonNullable<Awaited<ReturnType<typeof loadListingView>>>["pos"];
  history: NonNullable<Awaited<ReturnType<typeof loadListingView>>>["history"];
}) {
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${listing.slug}`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-primary"
      >
        ← Back to board
      </Link>

      <header className="mb-8 flex items-start gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-elevated">
          {listing.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.logoUrl}
              alt={listing.name}
              className="size-full object-cover"
            />
          ) : (
            <span className="font-display text-2xl text-fg-muted">
              {listing.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-widest text-fg-subtle">
            {pos ? `Currently #${pos.rank}` : "Not on the board"}
          </p>
          <h1 className="mt-1 font-display text-3xl text-fg sm:text-4xl">
            {listing.name}
          </h1>
          {listing.description && (
            <p className="mt-2 text-sm text-fg-muted">{listing.description}</p>
          )}
          {listing.websiteUrl && (
            <a
              href={listing.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {listing.websiteUrl.replace(/^https?:\/\//, "")}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
        <ShareButton url={shareUrl} label={listing.name} />
      </header>

      {pos ? (
        <div className="mb-10 flex flex-wrap items-center gap-3">
          <Link
            href={`/${pos.rank}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 font-display text-sm text-primary-fg transition-colors hover:bg-primary-hover"
          >
            View #{pos.rank}
          </Link>
          <Stat label="Current bid" value={formatUsdFromPaise(pos.currentBid)} mono inline />
        </div>
      ) : (
        <div className="mb-10 rounded-lg border border-dashed border-border bg-surface p-6 text-center">
          <p className="text-fg-muted">
            {listing.name} is not currently on the board.
          </p>
        </div>
      )}

      <section
        aria-label="Listing history"
        className="rounded-lg border border-border bg-surface"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <HistoryIcon className="size-4 text-fg-muted" aria-hidden />
          <h2 className="font-display text-lg text-fg">Activity</h2>
        </header>
        {history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-fg-subtle">
            No activity yet.
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {history.map((row) => (
              <li key={row.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span
                  className={cn(
                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-elevated",
                    actionAccent(row.action),
                  )}
                  aria-hidden
                >
                  {actionIcon(row.action)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-fg">
                    <span className="font-medium">{row.userName ?? "Someone"}</span>{" "}
                    <span className="text-fg-muted">{listingActionVerb(row.action)}</span>{" "}
                    {row.bidAmount > 0 && (
                      <span className="font-mono text-xs text-accent">
                        · {formatUsdFromPaise(row.bidAmount)}
                      </span>
                    )}
                  </p>
                  <time
                    className="font-mono text-xs text-fg-subtle"
                    dateTime={row.createdAt.toISOString()}
                  >
                    {formatRelative(row.createdAt)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

/* ============================================================
 * Shared subcomponents
 * ============================================================ */

function HistorySection({
  rank,
  history,
  isPodium,
}: {
  rank: number;
  history: NonNullable<Awaited<ReturnType<typeof loadRankView>>>["history"];
  isPodium: boolean;
}) {
  return (
    <section
      aria-label="Position history"
      className="rounded-lg border border-border bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <HistoryIcon className="size-4 text-fg-muted" aria-hidden />
        <h2 className="font-display text-lg text-fg">History</h2>
      </header>
      {history.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-fg-subtle">
          No history yet. {isPodium ? "Podium spot" : "Spot"} #{rank} is fresh.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {history.map((row) => (
            <li key={row.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-elevated",
                  actionAccent(row.action),
                )}
                aria-hidden
              >
                {actionIcon(row.action)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-fg">
                  <span className="font-medium">{row.userName ?? "Someone"}</span>{" "}
                  <span className="text-fg-muted">{actionVerb(row.action)}</span>{" "}
                  {actionInvolvesPrevious(row.action) && row.previousListingName ? (
                    <Link
                      href={row.previousListingSlug ? `/${row.previousListingSlug}` : "#"}
                      className="text-primary hover:underline"
                    >
                      {row.previousListingName}
                    </Link>
                  ) : row.listingName ? (
                    <Link
                      href={row.listingSlug ? `/${row.listingSlug}` : "#"}
                      className="text-primary hover:underline"
                    >
                      {row.listingName}
                    </Link>
                  ) : null}{" "}
                  {row.bidAmount > 0 && (
                    <span className="font-mono text-xs text-accent">
                      · {formatUsdFromPaise(row.bidAmount)}
                    </span>
                  )}
                </p>
                <time
                  className="font-mono text-xs text-fg-subtle"
                  dateTime={row.createdAt.toISOString()}
                >
                  {formatRelative(row.createdAt)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  mono,
  accent,
  icon,
  inline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: "accent" | "danger" | "muted";
  icon?: ReactNode;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="rounded-md border border-border bg-surface px-4 py-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 flex items-center gap-1.5 text-base",
            mono && "font-mono tabular-nums",
            accent === "accent" && "text-accent",
            accent === "danger" && "text-danger",
            accent === "muted" && "text-fg-muted",
          )}
        >
          {icon}
          {value}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="font-mono text-xs uppercase tracking-widest text-fg-subtle">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 flex items-center gap-1.5 text-xl",
          mono && "font-mono tabular-nums",
          accent === "accent" && "text-accent",
          accent === "danger" && "text-danger",
          accent === "muted" && "text-fg-muted",
        )}
      >
        {icon}
        {value}
      </p>
    </div>
  );
}

function actionVerb(action: string): string {
  switch (action) {
    case "claimed": return "claimed";
    case "outbid": return "was outbid at";
    case "pushed_out": return "was pushed from";
    case "removed": return "fell off at";
    case "refunded": return "was refunded at";
    case "frozen": return "froze";
    case "unfrozen": return "unfroze";
    default: return "touched";
  }
}

function listingActionVerb(action: string): string {
  switch (action) {
    case "claimed": return "claimed a rank for";
    case "outbid": return "was outbid at";
    case "pushed_out": return "was pushed from";
    case "removed": return "fell off at";
    case "refunded": return "was refunded at";
    default: return "touched";
  }
}

function actionInvolvesPrevious(action: string): boolean {
  return (
    action === "outbid" ||
    action === "pushed_out" ||
    action === "removed" ||
    action === "refunded"
  );
}

function actionAccent(action: string): string {
  switch (action) {
    case "claimed": return "text-accent";
    case "outbid":
    case "pushed_out":
    case "removed": return "text-urgency";
    case "refunded": return "text-danger";
    default: return "text-fg-muted";
  }
}

function actionIcon(action: string): ReactNode {
  switch (action) {
    case "claimed": return <Crown className="size-3.5" aria-hidden />;
    case "outbid":
    case "pushed_out":
    case "removed": return <Snowflake className="size-3.5" aria-hidden />;
    case "refunded": return <HistoryIcon className="size-3.5" aria-hidden />;
    default: return <HistoryIcon className="size-3.5" aria-hidden />;
  }
}
