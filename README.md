# top10s.lol

A live, competitive ranking board. 100 positions, $1 starting bid. Pay more to take the spot.

## Stack

- **Next.js 15** (App Router, /api routes) on Vercel
- **TypeScript** strict
- **Drizzle ORM** + **Postgres** (Neon, both prod and dev)
- **Clerk** for auth
- **Razorpay** for payments (Test Mode for dev, Live after KYC)
- **Upstash Redis** for rate limit + idempotency (REST)
- **Cloudflare R2** for logo storage (prod)
- **Resend** for transactional email (prod)
- **Tailwind CSS** with custom design tokens
- **Lucide React** for iconography

## Local setup

No Docker, no native DB install. Dev runs against **Neon Postgres** and **Upstash Redis** free tiers — same wire protocol + REST API as production.

Prereqs: **Node 20+**, free accounts at:

- [Neon](https://console.neon.tech) — Postgres
- [Upstash](https://console.upstash.com) — Redis
- [Clerk](https://dashboard.clerk.com) — auth (development instance)

```bash
# 1. Install deps
npm install

# 2. Configure env
cp .env.example .env.local
# Edit .env.local — fill the Phase 1 vars (see comments in file):
#   DATABASE_URL              → Neon → Project → Connection Details → "Pooled connection"
#   DATABASE_DIRECT_URL       → Neon → "Direct connection" (used by drizzle-kit only)
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY
#                             → Clerk → API Keys (development instance)

# 3. Apply schema to Neon
npm run db:generate      # already generated, but safe to re-run after schema edits
npm run db:migrate       # apply migrations to Neon
npm run db:seed          # 8 categories + 100 empty position rows

# 4. Run the app
npm run dev
```

Visit http://localhost:3000.

### Where to find each value

| Var | Where |
|---|---|
| `DATABASE_URL` | Neon → Project → Dashboard → Connection Details → **Pooled connection** (has `-pooler` in host) |
| `DATABASE_DIRECT_URL` | Same page → **Direct connection** (no `-pooler`) — used by `drizzle-kit` and `tsx lib/db/migrate.ts` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys → **Show dev keys** |
| `CLERK_SECRET_KEY` | Same page |
| `NEXT_PUBLIC_APP_URL` | Local: `http://localhost:3000` |

### Verifying local setup

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `psql "$DATABASE_DIRECT_URL" -c "SELECT count(*) FROM positions;"` returns `100`
- [ ] `http://localhost:3000` renders the homepage (empty board hero)
- [ ] Sign-in modal opens (Clerk dev keys working)

### Database scripts

- `npm run db:generate` — produce SQL migration from `lib/db/schema.ts`
- `npm run db:migrate` — apply pending migrations to `DATABASE_DIRECT_URL`
- `npm run db:seed` — idempotent: 8 categories + 100 position rows (`ON CONFLICT DO NOTHING`)
- `npm run db:studio` — open Drizzle Studio in browser (uses `DATABASE_URL`)

### Tiered environment

Env vars are split into tiers, validated lazily on first import:

| Tier | Vars | Phase |
|---|---|---|
| 1 — Boot | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_APP_URL` | 0+ |
| 2 — DB | `DATABASE_URL`, `DATABASE_DIRECT_URL` | 1+ |
| 3a — Razorpay | `RAZORPAY_*` | 3+ |
| 3b — Upstash | `UPSTASH_*` | 3+ |
| 3c — R2 | `R2_*` | 2+ |
| 3d — Clerk webhook | `CLERK_WEBHOOK_SECRET` | 2+ |
| 3e — Resend | `RESEND_*` | 12+ |

Later-phase vars can be omitted until those phases start. The app boots and renders Phase 1 with only Tiers 1+2 set. See `lib/env.ts`.

## Architecture

See the plan file at `/.claude/plans/prd-md-fuzzy-sonnet.md` for the full design (data model, atomic claim transaction, Razorpay flow, design system, phases).

## Deployment

Vercel single project. Same env layout as local: Neon pooled `DATABASE_URL` + direct `DATABASE_DIRECT_URL`, Upstash REST Redis, Razorpay Live Mode (after KYC), R2 bucket, Resend. See plan for full spec.

## Test scripts

`scripts/smoke-claim.ts` — single end-to-end claim against Neon (creates a user + listing, inserts a bid, calls `claim()`, asserts position updated + history + activity_feed rows + idempotent replay).

`scripts/race-claim.ts` — fires 10 concurrent `claim()` calls for the same target rank with different amounts. Asserts: highest amount wins, every captured bid has a "claimed" history row, every errored bid has zero history rows (tx rollback works), board invariant (100 positions) intact.

`scripts/test-verify.ts` — HMAC SHA-256 test vectors for `verifyRazorpaySignature` (valid sig, bad sig, missing sig, length mismatch, tampered body, wrong secret).

```bash
npx tsx scripts/smoke-claim.ts
npx tsx scripts/race-claim.ts
npx tsx scripts/test-verify.ts
```

All three run against the DB in `.env.local`. `test-verify.ts` is in-process (no DB needed).

## Payment modes

The app boots in one of two payment modes, picked by env:

### Mock mode (default for dev)

Set in `.env.local`:
```
RAZORPAY_MOCK=true
UPSTASH_MOCK=true
```

- `POST /api/claims` invokes `claim()` **synchronously** in the same request — no real Razorpay API call, no webhook.
- Rate limit + idempotency are no-ops (Upstash stub).
- Useful for local dev and E2E tests without a Razorpay account.

### Real mode (Razorpay Test Mode)

Set in `.env.local`:
```
RAZORPAY_MOCK=false
RAZORPAY_KEY_ID=rzp_test_…
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=whsec_…
UPSTASH_MOCK=false
UPSTASH_REDIS_REST_URL=https://…upstash.io
UPSTASH_REDIS_REST_TOKEN=…
CRON_SECRET=…                     # for /api/admin/cron/reconcile
```

Flow:
1. `POST /api/claims` → creates pending bid + Razorpay order → returns `{ razorpayOrderId, key, … }`.
2. Client opens Razorpay widget with `key` + `order_id`.
3. User pays with test card `4111 1111 1111 1111`, any future expiry, any CVV.
4. Razorpay POSTs `payment.captured` to `/api/webhooks/razorpay`.
5. Handler verifies HMAC, dedupes via `webhookEvents`, invokes `claim()`.

**Webhook tunneling** (Razorpay needs a public URL):
```bash
ngrok http 3000
# copy https://…ngrok.app → Razorpay dashboard → Webhooks → Add endpoint
# URL: https://…ngrok.app/api/webhooks/razorpay
# Events: payment.captured, payment.failed, refund.processed
```

**Vercel cron** (recover from missed webhooks):
```json
// vercel.json
{ "crons": [{ "path": "/api/admin/cron/reconcile", "schedule": "*/5 * * * *" }] }
```

The reconciler scans bids `pending > 5 min`, calls Razorpay's payments API, and force-captures (or refunds) them.

**Live mode** (after KYC): swap `rzp_test_` → `rzp_live_` keys, rotate `RAZORPAY_WEBHOOK_SECRET`, redeploy. No code changes.

## Storage modes

`STORAGE_DRIVER=r2` (default) uses Cloudflare R2 with presigned PUT. Requires `R2_*` env.

`STORAGE_DRIVER=local` writes logos to `./public/uploads/` via `POST /api/uploads/local/[...key]`. No R2 account needed for dev.

## Key invariants

(These live in `lib/board/claim.ts` and the schema. They are non-negotiable.)

- Exactly **100 position rows** at all times. Enforced in `claim()` + `assertBoardSize()`.
- Board mutations happen **only** from the Razorpay webhook handler (or the cron reconciler, which calls the same `claim()`).
- All board writes serialize through `pg_advisory_xact_lock(1)`. Belt-and-suspenders: `SELECT … FOR UPDATE` on bid + target position.
- Currency stored as **INR paise**, displayed in **USD**.
- Refunds **clear the rank and leave a gap** below.
- Webhook delivery is idempotent via `webhookEvents (provider, eventId) UNIQUE`.
- Idempotency-Key header on `POST /api/claims` dedupes double-clicks for 300s.
- Rate limit (Upstash sliding window) on `POST /api/claims` and `POST /api/listings`: 10/60s per user.
- CSRF: `middleware.ts` rejects state-changing API requests whose `Origin` does not match `NEXT_PUBLIC_APP_URL`. Webhook routes are exempt (HMAC-signed).
- Suspended users: `requireUser()` throws `ForbiddenError` → middleware/auth layout redirects to `/`.

## Email (Resend)

Resend is wired into `lib/board/claim.ts` post-commit:

- **claimConfirmed** → the new claimer.
- **pushedOut** → the previous holder when a takeover cascades them down.
- **removed** → the listing that fell off #100.

When `RESEND_API_KEY` is unset, emails write to `./.emails/<timestamp>_<id>.html` so the content can be inspected locally. Set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` in prod.

## Admin

`/admin` (visible to users with `isAdmin = true`) ships four sections:

- **Overview** — board + bid ledger counts, recent captures.
- **Positions** — all 100 with freeze/remove actions.
- **Bids** — last 200 with refund action.
- **Users** — with suspend toggle.

Auto-promote: set `ADMIN_EMAILS=you@example.com` (comma-separated). `requireUser()` promotes matching addresses on every sign-in.

All admin actions live behind `withAdmin(...)` (`lib/api/admin.ts`), which calls `requireAdmin()` and returns 401/403 JSON otherwise.

## Production deploy

### Pre-flight checklist

- [ ] Neon project created. Two connection strings ready (pooled + direct).
- [ ] Upstash Redis REST URL + token.
- [ ] Cloudflare R2 bucket + access key + secret + account id.
- [ ] Razorpay **Live Mode** enabled (post-KYC). Live key id + secret + webhook secret.
- [ ] Resend API key + verified sender domain.
- [ ] Clerk production instance keys.
- [ ] `ADMIN_EMAILS` populated.
- [ ] `CRON_SECRET` set (random 32+ chars).
- [ ] `NEXT_PUBLIC_APP_URL` set to `https://top10s.lol`.

### Vercel setup

1. Push to GitHub, import repo at [vercel.com/new](https://vercel.com/new).
2. **Build command:** `npm run build` (default).
3. **Output directory:** leave default (Next.js).
4. **Region:** `bom1` (Mumbai) — closest to Razorpay + primary user base.
5. Add all env vars from the table above. Vercel encrypts at rest.
6. Add the cron schedule in `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/admin/cron/reconcile", "schedule": "*/5 * * * *" }] }
   ```
7. Deploy. Note the preview URL.

### Razorpay webhook (live)

After deploy:

1. Razorpay Dashboard → Settings → Webhooks → **Add endpoint**.
2. URL: `https://top10s.lol/api/webhooks/razorpay`
3. Events: `payment.captured`, `payment.failed`, `refund.processed`
4. Copy the webhook secret into Vercel as `RAZORPAY_WEBHOOK_SECRET`. Redeploy.

### Clerk webhook (live)

1. Clerk Dashboard → Webhooks → **Add endpoint**.
2. URL: `https://top10s.lol/api/webhooks/clerk`
3. Events: `user.created`, `user.updated`
4. Copy signing secret → `CLERK_WEBHOOK_SECRET`.

### Smoke checklist (prod)

Run each before opening the board to users:

- [ ] `npm run db:seed` against the prod Neon branch (idempotent — safe to re-run).
- [ ] `npx tsx scripts/smoke-claim.ts` (with prod env in `.env.local`) → PASS.
- [ ] `npx tsx scripts/race-claim.ts` → PASS.
- [ ] `npx tsx scripts/test-verify.ts` → PASS.
- [ ] Open the homepage; sign in via Clerk; create a listing; claim an empty spot.
- [ ] Verify the Razorpay dashboard shows the test order as **paid**.
- [ ] Verify the `webhook_events` row was written.
- [ ] Verify the activity feed row appears within 5s of claim.
- [ ] Toggle a test position to frozen in `/admin/positions`; attempt to claim it → rejected.

### Neon branches (preview deploys)

Recommended workflow:

- `main` branch → Neon **production** branch.
- `dev` / `feat/*` branches → Neon preview branches (auto-created via the Neon Vercel integration).

Each preview deploy gets isolated DB + the same schema. Razorpay webhook for preview: use Razorpay **Test Mode** and point the webhook at the preview URL during testing.

### Rollback

- **Code:** Vercel → Deployments → promote an older deployment.
- **DB:** Neon → restore from the most recent snapshot (point-in-time recovery up to 7 days on Free, 30 days on Launch).
- **Schema:** Drizzle migrations are forward-only. To revert, write a forward migration that reverses the change, or restore the schema snapshot.

### Key invariants (production)

The same invariants listed above apply. In addition, the cron reconciler guarantees the board converges even if Razorpay webhooks are lost for up to one cron interval (5 min).
