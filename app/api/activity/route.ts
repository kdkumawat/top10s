import { NextResponse, type NextRequest } from "next/server";
import { getRecentActivity } from "@/lib/db/queries/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/activity
 * Public. Polled by the activity feed every 5s.
 * Query: ?limit=N (1-50, default 20)
 */
export async function GET(req: NextRequest) {
  const limitParam = new URL(req.url).searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;
  const items = await getRecentActivity(Number.isFinite(limit) ? limit : 20);
  return NextResponse.json(
    {
      items: items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "private, must-revalidate, max-age=0",
      },
    },
  );
}
