import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getDbEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Single Drizzle client for the app runtime.
 * Uses Neon's HTTP driver — works on Vercel Edge, no TCP needed.
 * Works in dev (Neon free tier, pooled host) and prod (Neon prod branch) — same driver.
 */
const { DATABASE_URL } = getDbEnv();
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is empty");
}
const sql = neon(DATABASE_URL);

export const db = drizzle(sql, { schema });
export { schema };
export type DB = typeof db;
