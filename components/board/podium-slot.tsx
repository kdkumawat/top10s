import { cn } from "@/lib/utils";
import { Trophy, Medal } from "@/lib/icons";
import { ListingLogo } from "./listing-logo";
import { formatUsdFromPaise } from "@/lib/money";
import type { BoardPosition } from "@/lib/db/queries/board";

interface PodiumSlotProps {
  rank: 1 | 2 | 3;
  position: BoardPosition;
}

const RANK_COLORS = {
  1: "bg-rank1 text-gold-fg",
  2: "bg-rank2/20 text-rank2",
  3: "bg-rank3/20 text-rank3",
} as const;

const RANK_LABEL = { 1: "#1", 2: "#2", 3: "#3" } as const;
const RANK_ICON = { 1: Trophy, 2: Medal, 3: Medal } as const;

export function PodiumSlot({ rank, position }: PodiumSlotProps) {
  const Icon = RANK_ICON[rank];
  const isGold = rank === 1;
  const listing = position.listing;
  const ariaLabel = listing
    ? `Rank ${rank}, ${listing.name}, current bid ${formatUsdFromPaise(position.currentBid)}`
    : `Rank ${rank}, empty, starting bid one dollar`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-2 rounded-lg p-4",
        "transition-all duration-quick ease-out-soft",
        "border border-border hover:border-border-strong hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        RANK_COLORS[rank],
        isGold ? "min-h-[180px]" : "min-h-[120px]",
      )}
    >
      <div className="flex items-center gap-2 font-display">
        <Icon className={cn("size-5", isGold ? "" : "opacity-80")} aria-hidden />
        <span
          className={cn(
            "font-display tabular-nums",
            isGold ? "text-4xl" : "text-2xl",
          )}
        >
          {RANK_LABEL[rank]}
        </span>
      </div>

      {listing ? (
        <>
          <ListingLogo src={listing.logoUrl} name={listing.name} size={isGold ? 64 : 48} />
          <div className="text-center">
            <div
              className={cn(
                "truncate font-body font-semibold",
                isGold ? "text-xl max-w-[260px]" : "text-base max-w-[160px]",
              )}
            >
              {listing.name}
            </div>
            <div
              className={cn(
                "font-mono tabular-nums",
                isGold ? "text-2xl" : "text-base",
              )}
            >
              {formatUsdFromPaise(position.currentBid)}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center">
          <div className="text-fg-subtle font-mono text-sm">— empty —</div>
          <div className="font-display text-2xl text-fg-muted">$1</div>
        </div>
      )}
    </div>
  );
}
