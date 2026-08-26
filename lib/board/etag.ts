import { createHash } from "node:crypto";

/**
 * Compute a weak ETag from a small set of versioned inputs.
 * Cheap to compute, no need to hash the full JSON payload.
 */
export function computeWeakETag(parts: (string | number | Date | null | undefined)[]): string {
  const normalized = parts
    .map((p) => {
      if (p === null || p === undefined) return "-";
      if (p instanceof Date) return p.toISOString();
      return String(p);
    })
    .join("|");
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `W/"${digest}"`;
}

/**
 * Compare an incoming If-None-Match header to a current ETag.
 * Supports comma-separated multi-value tags and the `*` wildcard.
 */
export function ifNoneMatchMatches(headerValue: string | null, currentEtag: string): boolean {
  if (!headerValue) return false;
  if (headerValue.trim() === "*") return true;
  const tokens = headerValue.split(",").map((t) => t.trim());
  return tokens.includes(currentEtag);
}
