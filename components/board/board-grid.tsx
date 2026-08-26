import { cn } from "@/lib/utils";
import { BoardCell } from "./board-cell";
import type { BoardPosition } from "@/lib/db/queries/board";

interface BoardGridProps {
  positions: BoardPosition[]; // 97 cells: #4..#100
  className?: string;
}

export function BoardGrid({ positions, className }: BoardGridProps) {
  return (
    <section
      aria-label="Positions 4 through 100"
      className={cn(
        "grid gap-2 sm:gap-3",
        "grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10",
        className,
      )}
    >
      {positions.map((p) => (
        <BoardCell key={p.rank} position={p} />
      ))}
    </section>
  );
}
