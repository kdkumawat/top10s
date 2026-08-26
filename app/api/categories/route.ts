import { NextResponse } from "next/server";
import { getAllCategoriesWithCounts } from "@/lib/db/queries/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/categories
 * Public. List of categories with occupied listing counts.
 */
export async function GET() {
  const items = await getAllCategoriesWithCounts();
  return NextResponse.json(
    { items, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "private, must-revalidate, max-age=0" } },
  );
}
