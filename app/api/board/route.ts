import { NextResponse, type NextRequest } from "next/server";
import { getBoard } from "@/lib/db/queries/board";
import { computeWeakETag, ifNoneMatchMatches } from "@/lib/board/etag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/board
 * Public, polled by clients every 3–5s. Returns the same shape as the homepage RSC.
 *
 * ETag: weak sha256 over `maxUpdatedAt|occupied|empty|frozen` — fast to compute,
 * changes whenever the board mutates. On If-None-Match match → 304.
 */
export async function GET(req: NextRequest) {
  const board = await getBoard();
  const etag = computeWeakETag([
    board.maxUpdatedAt,
    board.counts.occupied,
    board.counts.empty,
    board.counts.frozen,
  ]);

  if (ifNoneMatchMatches(req.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, must-revalidate, max-age=0",
      },
    });
  }

  return NextResponse.json(
    { ...board, updatedAt: new Date().toISOString() },
    {
      headers: {
        ETag: etag,
        "Cache-Control": "private, must-revalidate, max-age=0",
      },
    },
  );
}
