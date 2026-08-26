import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { getStorageEnv } from "@/lib/env";
import {
  isAllowedContentType,
  getMaxLogoBytes,
  getAllowedLogoContentTypes,
} from "@/lib/storage";

/**
 * Local-driver upload sink. Only active when STORAGE_DRIVER=local.
 * Writes the request body to public/uploads/{key} and returns 200.
 *
 * Path: POST /api/uploads/local/logos/{userId}/{uuid}.{ext}
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { STORAGE_DRIVER } = getStorageEnv();
  if (STORAGE_DRIVER !== "local") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Local upload disabled" } },
      { status: 404 },
    );
  }

  const { key } = await params;
  const fullKey = (key ?? []).join("/");
  if (!fullKey.startsWith("logos/") || fullKey.includes("..")) {
    return NextResponse.json(
      { error: { code: "invalid_key", message: "Invalid storage key" } },
      { status: 400 },
    );
  }

  const contentType = req.headers.get("content-type");
  if (!isAllowedContentType(contentType)) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_content_type",
          message: `Allowed types: ${getAllowedLogoContentTypes().join(", ")}`,
        },
      },
      { status: 415 },
    );
  }

  // Enforce size limit by reading the body and checking length.
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > getMaxLogoBytes()) {
    return NextResponse.json(
      { error: { code: "payload_too_large", message: "Max 2MB" } },
      { status: 413 },
    );
  }

  const outPath = resolve(process.cwd(), "public", "uploads", fullKey);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);

  return NextResponse.json({ ok: true, key: fullKey, size: buf.length });
}
