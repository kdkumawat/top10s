import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { categories } from "./schema";

// Minimal .env.local loader — mirrors drizzle.config.ts.
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("[seed] DATABASE_URL (or DATABASE_DIRECT_URL) is required");
  process.exit(1);
}

const SEED_CATEGORIES = [
  { slug: "ai", name: "AI" },
  { slug: "apps", name: "Apps" },
  { slug: "startups", name: "Startups" },
  { slug: "games", name: "Games" },
  { slug: "websites", name: "Websites" },
  { slug: "creators", name: "Creators" },
  { slug: "products", name: "Products" },
  { slug: "music", name: "Music" },
] as const;

async function main() {
  const client = postgres(url!, { max: 1 });
  const db = drizzle(client);

  console.log("[seed] upserting categories…");
  for (const c of SEED_CATEGORIES) {
    await db
      .insert(categories)
      .values(c)
      .onConflictDoNothing({ target: categories.slug });
  }

  console.log("[seed] ensuring 100 position rows exist…");
  await db.execute(sql`
    INSERT INTO positions (rank, current_bid, frozen, updated_at)
    SELECT g, 0, false, now()
    FROM generate_series(1, 100) AS g
    ON CONFLICT (rank) DO NOTHING
  `);

  const result = (await db.execute(sql`SELECT count(*)::int AS count FROM positions`)) as {
    count: number;
  }[];
  const count = result[0]?.count ?? 0;
  console.log(`[seed] positions now: ${count}`);
  if (count !== 100) {
    throw new Error(`Expected 100 positions, got ${count}`);
  }

  console.log("[seed] done");
  await client.end();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
