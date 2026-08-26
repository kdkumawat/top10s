import { NextResponse, type NextRequest } from "next/server";
import {
  getPositionByRank,
  getPositionHistory,
} from "@/lib/db/queries/positions";
import { computeWeakETag, ifNoneMatchMatches } from "@/lib/board/etag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/positions/[rank]
 * Public. Returns current position + last 20 history rows.
 * Query: ?limit=N (1-100, default 20)
 *
 * ETag: weak sha256 over rank|updatedAt|historyCount — invalidates whenever
 * the position mutates or new history rows are written.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ rank: string }> },
) {
  const { rank: raw } = await params;
  const rank = Number.parseInt(raw, 10);
  if (!Number.isInteger(rank) || rank < 1 || rank > 100) {
    return NextResponse.json(
      { error: { code: "invalid_rank", message: "Rank must be 1-100" } },
      { status: 400 },
    );
  }

  const limitParam = new URL(req.url).searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(1, limit), 100) : 20;

  const [pos, history] = await Promise.all([
    getPositionByRank(rank),
    getPositionHistory(rank, safeLimit),
  ]);

  if (!pos) {
    return NextResponse.json(
      { error: { code: "not_found", message: `Position #${rank} not found` } },
      { status: 404 },
    );
  }

  const latestHistoryAt = history[0]?.createdAt ?? null;
  const etag = computeWeakETag([rank, pos.updatedAt, history.length, latestHistoryAt]);

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
    {
      position: {
        ...pos,
        heldSince: pos.heldSince?.toISOString() ?? null,
        updatedAt: pos.updatedAt.toISOString(),
      },
      history: history.map((h) => ({
        ...h,
        createdAt: h.createdAt.toISOString(),
      })),
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        ETag: etag,
        "Cache-Control": "private, must-revalidate, max-age=0",
      },
    },
  );
}
