import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/clerk";
import {
  createLogoUpload,
  getAllowedLogoContentTypes,
  getMaxLogoBytes,
  isAllowedContentType,
} from "@/lib/storage";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  contentType: z.string().min(1),
});

/**
 * POST /api/uploads/logo
 * Body: { contentType: "image/png" | "image/jpeg" | "image/webp" }
 * Returns: { uploadUrl, uploadHeaders, publicUrl, key }
 *
 * Client PUTs the file body to `uploadUrl`, then sets `publicUrl` on the listing.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }
    throw err;
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_body",
          message: err instanceof z.ZodError ? err.message : "Invalid body",
        },
      },
      { status: 400 },
    );
  }

  if (!isAllowedContentType(parsed.contentType)) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_content_type",
          message: `Allowed: ${getAllowedLogoContentTypes().join(", ")}`,
          details: { maxBytes: getMaxLogoBytes() },
        },
      },
      { status: 415 },
    );
  }

  const presigned = await createLogoUpload({
    userId: user.id,
    contentType: parsed.contentType,
  });

  return NextResponse.json(presigned, { status: 201 });
}
