import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/clerk";
import { createListing, getListingsByUser } from "@/lib/db/queries/listings";
import { errorResponse } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(60),
  websiteUrl: z.string().url().or(z.literal("")).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().max(280).optional().or(z.literal("")),
  categorySlugs: z.array(z.string().min(1).max(32)).max(8).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await getListingsByUser(user.id);
    return NextResponse.json({ listings: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = createSchema.parse(await req.json());
    const row = await createListing({
      userId: user.id,
      name: body.name,
      websiteUrl: body.websiteUrl || null,
      logoUrl: body.logoUrl || null,
      description: body.description || null,
      categorySlugs: body.categorySlugs ?? [],
    });
    return NextResponse.json({ listing: row }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
