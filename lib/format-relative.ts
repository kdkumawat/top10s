/**
 * Format a date as a short relative time string: "5s ago", "2m ago", "3h ago", "2d ago".
 * Uses Intl.RelativeTimeFormat for stable output.
 */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const diffMs = then.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return diffSec <= -1 ? `${absSec}s ago` : "just now";
  if (absSec < 3600) return `${Math.round(absSec / 60)}m ago`;
  if (absSec < 86_400) return `${Math.round(absSec / 3600)}h ago`;
  if (absSec < 86_400 * 30) return `${Math.round(absSec / 86_400)}d ago`;
  return then.toLocaleDateString();
}
