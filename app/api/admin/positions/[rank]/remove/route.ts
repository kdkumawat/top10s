import { NextResponse, type NextRequest } from "next/server";
import { clearPosition } from "@/lib/board/admin";
import { errorResponse } from "@/lib/api/respond";
import { withAdmin } from "@/lib/api/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/positions/[rank]/remove
 * Clears a position (gap stays open).
 */
export const POST = withAdmin<{ rank: string }>(async (_req, { rank: raw }) => {
  const rank = Number.parseInt(raw, 10);
  try {
    const result = await clearPosition(rank);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
