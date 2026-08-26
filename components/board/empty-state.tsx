import { Button } from "@/components/ui/button";
import { Crown } from "@/lib/icons";

interface EmptyStateProps {
  occupied: number;
  empty: number;
}

/**
 * Shown on the board when no positions are claimed yet.
 * Per design system: large gold "Claim a spot" CTA, brand headline.
 */
export function EmptyState({ occupied, empty }: EmptyStateProps) {
  if (occupied > 0) return null;
  return (
    <div
      role="region"
      aria-label="Board is empty"
      className="relative mx-auto max-w-2xl overflow-hidden rounded-xl border border-border bg-surface p-8 text-center sm:p-12"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-fg) 1px, transparent 1px), linear-gradient(90deg, var(--color-fg) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative">
        <div className="mb-4 inline-flex items-center gap-2 font-display text-display text-gold">
          <Crown className="size-12" aria-hidden />
        </div>
        <h2 className="font-display text-4xl text-fg sm:text-5xl">100 spots.</h2>
        <p className="mt-2 text-lg text-fg-muted">Starting at $1.</p>
        <p className="mt-4 text-sm text-fg-subtle">
          {empty} positions waiting. Be the first to claim one.
        </p>
        <div className="mt-8">
          <Button variant="gold" size="lg">
            Claim a spot
          </Button>
        </div>
      </div>
    </div>
  );
}
