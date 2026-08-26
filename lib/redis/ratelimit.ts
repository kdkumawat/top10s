import "server-only";
import { getUpstashMock, getUpstashEnv } from "@/lib/env";

/**
 * Rate limit. In real mode uses @upstash/ratelimit sliding window.
 * In mock mode returns always-allowed.
 */
export type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number; // epoch seconds
};

let _realLimiter:
  | ((
      identifier: string,
    ) => Promise<{ success: boolean; remaining: number; reset: number }>)
  | undefined;

function buildRealLimiter() {
  return async function limit(identifier: string) {
    if (!_realLimiter) {
      const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = getUpstashEnv();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Ratelimit } = require("@upstash/ratelimit") as typeof import("@upstash/ratelimit");
      const redis = new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
      });
      const limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "60 s"),
        analytics: false,
        prefix: "rl:claims",
      });
      _realLimiter = async (id: string) => {
        const r = await limiter.limit(id);
        return {
          success: r.success,
          remaining: r.remaining,
          reset: r.reset,
        };
      };
    }
    return _realLimiter(identifier);
  };
}

const mockLimit = async (): Promise<RateLimitResult> => ({
  success: true,
  remaining: 999,
  reset: Math.floor(Date.now() / 1000) + 60,
});

/** 10 requests per 60s per identifier (user id or IP). */
export async function limitClaims(identifier: string): Promise<RateLimitResult> {
  if (getUpstashMock().UPSTASH_MOCK) return mockLimit();
  return buildRealLimiter()(identifier);
}
