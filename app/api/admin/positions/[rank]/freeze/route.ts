import { NextResponse, type NextRequest } from "next/server";
import { setPositionFrozen } from "@/lib/board/admin";
import { errorResponse } from "@/lib/api/respond";
import { withAdmin } from "@/lib/api/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/positions/[rank]/freeze
 * Body: { frozen: boolean }
 */
export const POST = withAdmin<{ rank: string }>(async (req, { rank: raw }) => {
  const rank = Number.parseInt(raw, 10);
  const body = (await req.json().catch(() => ({}))) as { frozen?: unknown };
  const frozen = body.frozen;
  if (typeof frozen !== "boolean") {
    return NextResponse.json(
      { error: { code: "bad_request", message: "frozen (boolean) required" } },
      { status: 400 },
    );
  }
  try {
    const result = await setPositionFrozen(rank, frozen);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
