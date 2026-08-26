import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getDbEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Transactional DB client. Uses postgres-js (TCP) instead of the neon-http
 * driver so we get real BEGIN/COMMIT semantics. Required for `claim()` and
 * any other code path that needs row locks / advisory locks.
 *
 * Reuses a small pool (4) — Vercel functions get one execution context per
 * request, so this stays cheap.
 */
let _sql: ReturnType<typeof postgres> | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getClient() {
  if (_sql) return _sql;
  const env = getDbEnv();
  const url = env.DATABASE_DIRECT_URL ?? env.DATABASE_URL;
  _sql = postgres(url, { max: 4, prepare: false });
  return _sql;
}

export function txDb() {
  if (_db) return _db;
  _db = drizzle(getClient(), { schema });
  return _db;
}
