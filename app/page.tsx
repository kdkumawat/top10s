import { cn } from "@/lib/utils";
import { getBoard } from "@/lib/db/queries/board";
import { getRecentActivity } from "@/lib/db/queries/activity";
import { getAllCategoriesWithCounts } from "@/lib/db/queries/categories";
import { PodiumSlot } from "@/components/board/podium-slot";
import { BoardGrid } from "@/components/board/board-grid";
import { EmptyState } from "@/components/board/empty-state";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { CategoryNav } from "@/components/category/category-nav";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [board, activity, categories] = await Promise.all([
    getBoard(),
    getRecentActivity(20),
    getAllCategoriesWithCounts(),
  ]);
  const [p1, p2, p3] = board.podium;

  const initialActivity = activity.map((i) => ({
    id: i.id,
    kind: i.kind,
    listingId: i.listingId,
    listingName: i.listingName,
    listingSlug: i.listingSlug,
    userName: i.userName,
    rank: i.rank,
    amount: i.amount,
    createdAt: i.createdAt.toISOString(),
  }));

  return (
    <main
      id="board"
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
    >
      <header className="mb-6 text-center sm:mb-8">
        <h1 className="font-display text-5xl text-gold sm:text-display">
          top10s.lol
        </h1>
        <p className="mt-3 text-base text-fg-muted sm:text-xl">
          100 spots. Beat the bid. Take the spot.
        </p>
        <p className="mt-1 font-mono text-xs text-fg-subtle tabular-nums">
          {board.counts.occupied}/100 occupied · {board.counts.empty} empty
        </p>
      </header>

      <div className="mb-6 sm:mb-8">
        <CategoryNav categories={categories} />
      </div>

      <div className={cn("grid gap-6", "grid-cols-1 lg:grid-cols-[1fr_320px]")}>
        <div>
          {board.counts.occupied === 0 ? (
            <EmptyState
              occupied={board.counts.occupied}
              empty={board.counts.empty}
            />
          ) : (
            <>
              {/* Podium: #1, #2, #3 */}
              <section
                aria-label="Top 3 podium"
                className={cn(
                  "mb-6 grid gap-3 sm:mb-8 sm:gap-4",
                  "grid-cols-1 sm:grid-cols-3",
                )}
              >
                <div className="order-2 sm:order-1">
                  <PodiumSlot rank={2} position={p2} />
                </div>
                <div className="order-1 sm:order-2">
                  <PodiumSlot rank={1} position={p1} />
                </div>
                <div className="order-3">
                  <PodiumSlot rank={3} position={p3} />
                </div>
              </section>

              {/* Grid: #4-#100 */}
              <BoardGrid positions={board.grid} />
            </>
          )}
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <ActivityFeed initialItems={initialActivity} />
        </aside>
      </div>
    </main>
  );
}
