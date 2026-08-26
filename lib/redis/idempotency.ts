import "server-only";
import { getRedis } from "./client";

/**
 * Idempotency-Key cache. Returns the cached result if the key was seen before,
 * otherwise runs `fn` and stores the result under the key for `ttlSec`.
 *
 * Used by /api/claims to dedupe double-clicks. Webhook events use the
 * `webhook_events` table for stronger dedupe across processes.
 */
export async function getOrSet<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // Corrupt entry — treat as miss.
    }
  }
  const value = await fn();
  await redis.set(key, JSON.stringify(value), { ex: ttlSec, nx: false });
  return value;
}
