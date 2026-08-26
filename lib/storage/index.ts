import "server-only";
import { randomUUID } from "node:crypto";
import { getResolvedStorage } from "@/lib/env";

/**
 * Storage adapter. Two drivers, picked by STORAGE_DRIVER env:
 *   r2    → Cloudflare R2 presigned PUT (prod)
 *   local → POST to our own /api/uploads/local/[...key] (dev only)
 *
 * The client uses one shape: PUT the file body to `uploadUrl`, set the
 * returned `publicUrl` on the listing.
 */

export type PresignedUpload = {
  /** Where to PUT the file bytes. */
  uploadUrl: string;
  /** Headers the client must send (e.g. Content-Type). */
  uploadHeaders: Record<string, string>;
  /** Public URL where the file will be served from after upload. */
  publicUrl: string;
  /** Storage key (e.g. "logos/abc.png"). Useful for logging / deletion. */
  key: string;
};

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export function isAllowedContentType(ct: string | null | undefined): boolean {
  if (!ct) return false;
  return ALLOWED_CONTENT_TYPES.has(ct.toLowerCase());
}

export function getMaxLogoBytes(): number {
  return MAX_BYTES;
}

export function getAllowedLogoContentTypes(): readonly string[] {
  return Array.from(ALLOWED_CONTENT_TYPES);
}

/** Build a deterministic-ish storage key for a logo. */
export function buildLogoKey(userId: string, contentType: string): string {
  const ext = contentType.split("/")[1]?.toLowerCase() ?? "bin";
  const safeExt = ext === "jpeg" ? "jpg" : ext;
  return `logos/${userId}/${randomUUID()}.${safeExt}`;
}

/**
 * Return a presigned PUT URL the client can upload to.
 * `contentType` must be in the allow-list (caller validates first).
 */
export async function createLogoUpload(params: {
  userId: string;
  contentType: string;
}): Promise<PresignedUpload> {
  const key = buildLogoKey(params.userId, params.contentType);
  const storage = getResolvedStorage();

  if (storage.driver === "r2") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { S3Client } = await import("@aws-sdk/client-s3");

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${storage.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });

    const cmd = new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      ContentType: params.contentType,
      ContentLength: MAX_BYTES,
    });

    const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 300 });
    return {
      uploadUrl,
      uploadHeaders: { "Content-Type": params.contentType },
      publicUrl: `${storage.publicUrl.replace(/\/$/, "")}/${key}`,
      key,
    };
  }

  // Local driver — upload to our own API route which writes to public/uploads/.
  const { getBootEnv } = await import("@/lib/env");
  const { NEXT_PUBLIC_APP_URL } = getBootEnv();
  return {
    uploadUrl: `${NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/uploads/local/${key}`,
    uploadHeaders: { "Content-Type": params.contentType },
    publicUrl: `${storage.publicUrl.replace(/\/$/, "")}/${key}`,
    key,
  };
}
