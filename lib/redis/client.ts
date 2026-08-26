import "server-only";
import { getUpstashEnv, getUpstashMock } from "@/lib/env";

/**
 * Upstash Redis client (lazy). In UPSTASH_MOCK mode, returns a no-op stub so
 * rate limiting and idempotency work without a real Redis in dev.
 */

export type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean }): Promise<"OK" | null>;
  del(key: string): Promise<number>;
};

function buildNoop(): RedisLike {
  return {
    async get() {
      return null;
    },
    async set() {
      return "OK";
    },
    async del() {
      return 0;
    },
  };
}

let _client: RedisLike | undefined;

export function getRedis(): RedisLike {
  if (_client) return _client;
  if (getUpstashMock().UPSTASH_MOCK) {
    _client = buildNoop();
    return _client;
  }
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = getUpstashEnv();
  // Upstash SDK is loaded dynamically so env validation can run first.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@upstash/redis") as typeof import("@upstash/redis");
  const real = new mod.Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
  });
  // Adapt to RedisLike.
  _client = {
    async get(key) {
      const v = await real.get<string>(key);
      return v ?? null;
    },
    async set(key, value, opts) {
      const r = await real.set(key, value, opts as Parameters<typeof real.set>[2]);
      return (r ?? null) as "OK" | null;
    },
    async del(key) {
      return real.del(key);
    },
  };
  return _client;
}
