/**
 * Smoke test: ETag computation for /api/board + /api/positions/[rank].
 *
 * Run with: npx tsx scripts/smoke-etag.ts
 *
 * No DB required. Pure unit test of the ETag lib.
 *
 * Verifies:
 *   1. computeWeakETag is deterministic for same input
 *   2. computeWeakETag changes when any input changes
 *   3. ifNoneMatchMatches handles wildcard, exact, comma-separated, null
 *   4. The weak ETag format is `W/"<16hex>"`
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { computeWeakETag, ifNoneMatchMatches } from "../lib/board/etag";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`[etag] FAIL: ${msg}`);
    process.exit(1);
  }
}

async function main() {
  // 1. Determinism.
  const a = computeWeakETag([new Date("2026-01-01T00:00:00Z"), 5, 95, 0]);
  const b = computeWeakETag([new Date("2026-01-01T00:00:00Z"), 5, 95, 0]);
  assert(a === b, `same input should produce same ETag: ${a} vs ${b}`);
  console.log(`[etag] determinism: ${a}`);

  // 2. Format.
  assert(/^W\/"[0-9a-f]{16}"$/.test(a), `format mismatch: ${a}`);
  console.log(`[etag] format: W/"<16hex>" ✓`);

  // 3. Date objects vs ISO strings normalize identically.
  const dateObj = new Date("2026-01-01T00:00:00Z");
  const fromObj = computeWeakETag([dateObj, 5, 95, 0]);
  const fromStr = computeWeakETag([dateObj.toISOString(), 5, 95, 0]);
  assert(fromObj === fromStr, `Date vs ISO mismatch: ${fromObj} vs ${fromStr}`);
  console.log(`[etag] Date vs ISO normalization ✓`);

  // 4. Null/undefined normalize to "-".
  const withNull = computeWeakETag([null, 0, 0, 0]);
  const withDash = computeWeakETag(["-", 0, 0, 0]);
  assert(withNull === withDash, `null vs '-' mismatch: ${withNull} vs ${withDash}`);
  console.log(`[etag] null/undefined → '-' ✓`);

  // 5. Different maxUpdatedAt → different ETag.
  const t1 = new Date("2026-01-01T00:00:00Z");
  const t2 = new Date("2026-01-01T00:00:01Z");
  const e1 = computeWeakETag([t1, 5, 95, 0]);
  const e2 = computeWeakETag([t2, 5, 95, 0]);
  assert(e1 !== e2, `different updatedAt should change ETag`);
  console.log(`[etag] timestamp change → new ETag ✓`);

  // 6. Different counts → different ETag.
  const c1 = computeWeakETag([t1, 5, 95, 0]);
  const c2 = computeWeakETag([t1, 6, 94, 0]);
  assert(c1 !== c2, `different counts should change ETag`);
  console.log(`[etag] count change → new ETag ✓`);

  // 7. ifNoneMatchMatches — exact match.
  const tag = computeWeakETag([t1, 5, 95, 0]);
  assert(ifNoneMatchMatches(tag, tag) === true, "exact match should be true");
  assert(ifNoneMatchMatches(null, tag) === false, "null should be false");
  console.log(`[etag] exact + null matchers ✓`);

  // 8. Wildcard.
  assert(ifNoneMatchMatches("*", tag) === true, "wildcard should match");
  console.log(`[etag] wildcard ✓`);

  // 9. Comma-separated list (clients sometimes send multiple).
  const tag2 = computeWeakETag([t1, 5, 95, 0]);
  const tag3 = computeWeakETag([t1, 5, 95, 1]);
  const multiHeader = `W/"old", ${tag2}, W/"another"`;
  assert(ifNoneMatchMatches(multiHeader, tag2) === true, "multi should match current");
  assert(ifNoneMatchMatches(multiHeader, tag3) === false, "multi should not match different");
  console.log(`[etag] multi-value header ✓`);

  // 10. Whitespace tolerance.
  const padded = `  ${tag}  `;
  assert(ifNoneMatchMatches(padded, tag) === true, "padded header should match");
  console.log(`[etag] whitespace tolerance ✓`);

  console.log("[etag] PASS — ETag computation correct");
}

main().catch((err) => {
  console.error("[etag] error", err);
  process.exit(1);
});
