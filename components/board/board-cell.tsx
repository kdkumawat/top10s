import Link from "next/link";
import { cn } from "@/lib/utils";
import { Snowflake } from "@/lib/icons";
import { ListingLogo } from "./listing-logo";
import { formatUsdFromPaise } from "@/lib/money";
import type { BoardPosition } from "@/lib/db/queries/board";

interface BoardCellProps {
  position: BoardPosition;
}

export function BoardCell({ position }: BoardCellProps) {
  const { listing, currentBid, frozen, rank } = position;
  const isEmpty = !listing;
  const ariaLabel = isEmpty
    ? `Rank ${rank}, empty, starting bid one dollar`
    : `Rank ${rank}, ${listing.name}, current bid ${formatUsdFromPaise(currentBid)}`;

  const className = cn(
    "group relative flex flex-col items-center justify-center gap-1 rounded-md p-2",
    "aspect-square w-full",
    "border transition-all duration-quick ease-out-soft",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
    isEmpty
      ? "border-dashed border-empty hover:border-primary hover:bg-surface-elevated"
      : "border-border bg-surface hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md",
    frozen && "opacity-50",
  );

  const inner = (
    <>
      {frozen ? (
        <Snowflake className="absolute right-1 top-1 size-3 text-frozen" aria-hidden />
      ) : null}
      {isEmpty ? (
        <>
          <span className="font-mono text-xs text-fg-subtle">#{rank}</span>
          <span className="font-display text-sm text-fg-muted">$1</span>
        </>
      ) : (
        <>
          <ListingLogo src={listing.logoUrl} name={listing.name} size={32} />
          <div className="w-full truncate text-center font-body text-xs font-medium text-fg">
            {listing.name}
          </div>
          <div className="font-mono tabular-nums text-xs text-fg-muted">
            {formatUsdFromPaise(currentBid)}
          </div>
        </>
      )}
    </>
  );

  if (isEmpty) {
    return (
      <Link
        href={`/checkout/new?rank=${rank}`}
        role="button"
        aria-label={ariaLabel}
        data-rank={rank}
        className={className}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      data-rank={rank}
      data-frozen={frozen ? "true" : undefined}
      className={className}
    >
      {inner}
    </div>
  );
}
