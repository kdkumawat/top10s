/**
 * Generate a URL-safe slug from a free-form name.
 * Falls back to a deterministic suffix on collision (handled by caller).
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Append a numeric suffix: "cursor" → "cursor-2" → "cursor-3" */
export function withSuffix(base: string, n: number): string {
  return n <= 1 ? base : `${base}-${n}`;
}
