import { notFound } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatUsdFromPaise } from "@/lib/money";
import { formatRelative } from "@/lib/format-relative";
import { Crown, ExternalLink, Filter, Trophy } from "@/lib/icons";
import {
  getCategoryBySlug,
  getCategoryTop,
} from "@/lib/db/queries/categories";

export const revalidate = 30;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) return { title: "Category not found · top10s.lol" };
  const title = `Top 10 ${cat.name} · top10s.lol`;
  const description = `The top 10 ${cat.name.toLowerCase()} on top10s.lol.`;
  return { title, description, openGraph: { title, description } };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();

  const top = await getCategoryTop(slug, 10);
  const podium = top.slice(0, 3);
  const rest = top.slice(3);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-primary"
      >
        ← Back to board
      </Link>

      <header className="mb-8">
        <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-fg-subtle">
          <Filter className="size-3" aria-hidden />
          Category
        </p>
        <h1 className="mt-2 font-display text-4xl text-fg sm:text-5xl">
          Top {cat.name}
        </h1>
        <p className="mt-2 text-sm text-fg-muted tabular-nums">
          {top.length}/10 listed
        </p>
      </header>

      {top.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-fg-muted">
            No {cat.name.toLowerCase()} have claimed a spot yet.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 font-display text-sm text-primary-fg transition-colors hover:bg-primary-hover"
          >
            View the board
          </Link>
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <section
              aria-label={`Top 3 ${cat.name}`}
              className={cn(
                "mb-6 grid gap-3 sm:gap-4",
                podium.length === 1
                  ? "grid-cols-1"
                  : podium.length === 2
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-3",
              )}
            >
              {podium.map((p, idx) => (
                <CategoryCard
                  key={p.listingId}
                  position={p}
                  variant={
                    idx === 0 ? "first" : idx === 1 ? "second" : "third"
                  }
                />
              ))}
            </section>
          )}

          {rest.length > 0 && (
            <ol className="space-y-2" aria-label={`Ranks 4–10 ${cat.name}`}>
              {rest.map((p) => (
                <li key={p.listingId}>
                  <CategoryRow position={p} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}

function CategoryCard({
  position,
  variant,
}: {
  position: Awaited<ReturnType<typeof getCategoryTop>>[number];
  variant: "first" | "second" | "third";
}) {
  const usd = formatUsdFromPaise(position.currentBid);
  return (
    <Link
      href={`/${position.listingSlug}`}
      className={cn(
        "group flex flex-col rounded-lg border p-4 transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        variant === "first"
          ? "border-gold bg-gold/10 sm:p-6"
          : variant === "second"
            ? "border-fg-muted/40 bg-fg-muted/10"
            : "border-urgency/40 bg-urgency/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-mono text-xs uppercase tracking-widest",
              variant === "first"
                ? "text-gold"
                : variant === "second"
                  ? "text-fg-muted"
                  : "text-urgency",
            )}
          >
            #{position.rank} · {variant === "first" ? "Gold" : variant === "second" ? "Silver" : "Bronze"}
          </p>
          <h3 className="mt-1 truncate font-display text-2xl text-fg">
            {position.listingName}
          </h3>
          {position.description && (
            <p className="mt-1 line-clamp-2 text-sm text-fg-muted">
              {position.description}
            </p>
          )}
        </div>
        {variant === "first" ? (
          <Crown className="size-8 shrink-0 text-gold" aria-hidden />
        ) : (
          <Trophy
            className={cn(
              "size-7 shrink-0",
              variant === "second" ? "text-fg-muted" : "text-urgency",
            )}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-sm tabular-nums">
        <span className="text-accent">{usd}</span>
        {position.heldSince && (
          <span className="text-xs text-fg-subtle">
            held {formatRelative(position.heldSince)}
          </span>
        )}
      </div>
    </Link>
  );
}

function CategoryRow({
  position,
}: {
  position: Awaited<ReturnType<typeof getCategoryTop>>[number];
}) {
  const usd = formatUsdFromPaise(position.currentBid);
  return (
    <Link
      href={`/${position.listingSlug}`}
      className="group flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:border-primary"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface-elevated font-mono text-sm font-medium text-fg tabular-nums">
        {position.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-fg">{position.listingName}</p>
        {position.websiteUrl && (
          <p className="flex items-center gap-1 truncate font-mono text-xs text-fg-subtle">
            {position.websiteUrl.replace(/^https?:\/\//, "")}
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </p>
        )}
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-accent">
        {usd}
      </span>
    </Link>
  );
}
