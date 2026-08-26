import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/clerk";
import {
  deleteListing,
  getListingById,
  updateListing,
} from "@/lib/db/queries/listings";
import { errorResponse } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  websiteUrl: z.string().url().or(z.literal("")).nullable().optional(),
  logoUrl: z.string().url().or(z.literal("")).nullable().optional(),
  description: z.string().max(280).or(z.literal("")).nullable().optional(),
  categorySlugs: z.array(z.string().min(1).max(32)).max(8).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await getListingById(id);
    if (!row || row.status === "deleted") {
      return NextResponse.json(
        { error: { code: "not_found", message: "Listing not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ listing: row });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());
    const row = await updateListing(id, user.id, {
      name: body.name,
      websiteUrl: body.websiteUrl === "" ? null : body.websiteUrl ?? undefined,
      logoUrl: body.logoUrl === "" ? null : body.logoUrl ?? undefined,
      description: body.description === "" ? null : body.description ?? undefined,
      categorySlugs: body.categorySlugs,
    });
    return NextResponse.json({ listing: row });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteListing(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
