import { NextResponse, type NextRequest } from "next/server";
import { setUserSuspended } from "@/lib/board/admin";
import { errorResponse } from "@/lib/api/respond";
import { withAdmin } from "@/lib/api/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/[id]/suspend
 * Body: { suspended: boolean }
 */
export const POST = withAdmin<{ id: string }>(async (req, { id }) => {
  const body = (await req.json().catch(() => ({}))) as { suspended?: unknown };
  const suspended = body.suspended;
  if (typeof suspended !== "boolean") {
    return NextResponse.json(
      { error: { code: "bad_request", message: "suspended (boolean) required" } },
      { status: 400 },
    );
  }
  try {
    const result = await setUserSuspended(id, suspended);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
