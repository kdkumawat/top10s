import { z } from "zod";

/**
 * Tiered environment validation.
 *
 * Each tier is validated lazily on first access. This means Phase 0 + Phase 1
 * boot cleanly with only Tier 1 (Clerk + APP_URL) + Tier 2 (DATABASE_URL) set.
 * Later phases activate their tiers by importing the corresponding getter.
 *
 * Tier 1 — Boot (required for any page render via ClerkProvider)
 * Tier 2 — DB (required for any server module that touches the database)
 * Tier 3 — Later phases: Razorpay, Upstash, R2, Resend, Clerk webhook
 */

const trimmed = (s: string): string => s.trim();

/** Tier 1: required at boot. Imported by app/layout.tsx via ClerkProvider. */
const bootSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).transform(trimmed),
  CLERK_SECRET_KEY: z.string().min(1).transform(trimmed),
  NEXT_PUBLIC_APP_URL: z.string().url().transform(trimmed),
});

/** Tier 2: required when DB is first touched. Imported by lib/db/index.ts. */
const dbSchema = z.object({
  DATABASE_URL: z.string().url().transform(trimmed),
  DATABASE_DIRECT_URL: z.string().url().transform(trimmed).optional(),
});

/** Tier 3a: Phase 3+ (Razorpay claim flow). Required when RAZORPAY_MOCK != "true". */
const razorpaySchema = z.object({
  RAZORPAY_KEY_ID: z.string().min(1).transform(trimmed),
  RAZORPAY_KEY_SECRET: z.string().min(1).transform(trimmed),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).transform(trimmed),
});

/** Tier 3a-flag: RAZORPAY_MOCK bypasses real API + signature verify. Dev only. */
const razorpayMockSchema = z.object({
  RAZORPAY_MOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

/** Tier 3b: Phase 3+ (Upstash rate limit / idempotency). Required when UPSTASH_MOCK != "true". */
const upstashSchema = z.object({
  UPSTASH_REDIS_REST_URL: z.string().url().transform(trimmed),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).transform(trimmed),
});

/** Tier 3b-flag: UPSTASH_MOCK = no-op redis stub. Dev only. */
const upstashMockSchema = z.object({
  UPSTASH_MOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

/** Tier 3c: Phase 2+ (R2 logo uploads). Only required when STORAGE_DRIVER=r2. */
const r2Schema = z.object({
  R2_ACCOUNT_ID: z.string().min(1).transform(trimmed),
  R2_ACCESS_KEY_ID: z.string().min(1).transform(trimmed),
  R2_SECRET_ACCESS_KEY: z.string().min(1).transform(trimmed),
  R2_BUCKET: z.string().min(1).transform(trimmed),
  R2_PUBLIC_URL: z.string().url().transform(trimmed),
});

/** Tier 3c-alt: STORAGE_DRIVER switch. local = no R2 creds needed. */
const storageSchema = z.object({
  STORAGE_DRIVER: z.enum(["r2", "local"]).default("r2"),
});

/** Tier 3f: Vercel cron auth. Required in prod for /api/admin/cron/* routes. */
const cronSchema = z.object({
  CRON_SECRET: z.string().min(1).transform(trimmed).optional(),
});

/** Tier 3d: Phase 2+ (Clerk webhook for user sync). */
const clerkWebhookSchema = z.object({
  CLERK_WEBHOOK_SECRET: z.string().min(1).transform(trimmed).optional(),
});

/** Tier 3e: Phase 12+ (Resend transactional email). */
const resendSchema = z.object({
  RESEND_API_KEY: z.string().min(1).transform(trimmed),
  RESEND_FROM_EMAIL: z.string().email().transform(trimmed),
});

const commonSchema = z.object({
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, label: string): T {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error(
      `[env] Missing/invalid ${label} env vars:`,
      result.error.flatten().fieldErrors,
    );
    throw new Error(
      `Invalid ${label} environment. See server logs for missing variables.`,
    );
  }
  return result.data;
}

let _boot: z.infer<typeof bootSchema> & { NODE_ENV: "development" | "test" | "production" } | undefined;
export function getBootEnv() {
  return (_boot ??= parseOrThrow(
    bootSchema.merge(commonSchema.pick({ NODE_ENV: true })) as unknown as z.ZodType<
      z.infer<typeof bootSchema> & { NODE_ENV: "development" | "test" | "production" }
    >,
    "boot",
  ));
}

let _db: z.infer<typeof dbSchema> | undefined;
export function getDbEnv() {
  return (_db ??= parseOrThrow(dbSchema as unknown as z.ZodType<z.infer<typeof dbSchema>>, "database"));
}

let _razorpay: z.infer<typeof razorpaySchema> | undefined;
export function getRazorpayEnv() {
  return (_razorpay ??= parseOrThrow(razorpaySchema as unknown as z.ZodType<z.infer<typeof razorpaySchema>>, "razorpay"));
}

let _razorpayMock: z.infer<typeof razorpayMockSchema> | undefined;
export function getRazorpayMock() {
  return (_razorpayMock ??= parseOrThrow(
    razorpayMockSchema as unknown as z.ZodType<z.infer<typeof razorpayMockSchema>>,
    "razorpay-mock",
  ));
}

let _cron: z.infer<typeof cronSchema> | undefined;
export function getCronEnv() {
  return (_cron ??= parseOrThrow(cronSchema as unknown as z.ZodType<z.infer<typeof cronSchema>>, "cron"));
}

let _upstash: z.infer<typeof upstashSchema> | undefined;
export function getUpstashEnv() {
  return (_upstash ??= parseOrThrow(upstashSchema as unknown as z.ZodType<z.infer<typeof upstashSchema>>, "upstash"));
}

let _upstashMock: z.infer<typeof upstashMockSchema> | undefined;
export function getUpstashMock() {
  return (_upstashMock ??= parseOrThrow(
    upstashMockSchema as unknown as z.ZodType<z.infer<typeof upstashMockSchema>>,
    "upstash-mock",
  ));
}

let _r2: z.infer<typeof r2Schema> | undefined;
export function getR2Env() {
  return (_r2 ??= parseOrThrow(r2Schema as unknown as z.ZodType<z.infer<typeof r2Schema>>, "r2"));
}

let _storage: z.infer<typeof storageSchema> | undefined;
export function getStorageEnv() {
  return (_storage ??= parseOrThrow(
    storageSchema as unknown as z.ZodType<z.infer<typeof storageSchema>>,
    "storage",
  ));
}

/**
 * Resolved storage config. Validates R2 env only when STORAGE_DRIVER=r2.
 * Returns `{ driver: "r2", ...creds }` or `{ driver: "local", publicUrl }`.
 */
export function getResolvedStorage():
  | { driver: "r2"; accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string }
  | { driver: "local"; publicUrl: string } {
  const { STORAGE_DRIVER } = getStorageEnv();
  if (STORAGE_DRIVER === "local") {
    // Local driver uses NEXT_PUBLIC_APP_URL + /uploads/ for public URL.
    const { NEXT_PUBLIC_APP_URL } = getBootEnv();
    return { driver: "local", publicUrl: `${NEXT_PUBLIC_APP_URL}/uploads` };
  }
  const r2 = getR2Env();
  return {
    driver: "r2",
    accountId: r2.R2_ACCOUNT_ID,
    accessKeyId: r2.R2_ACCESS_KEY_ID,
    secretAccessKey: r2.R2_SECRET_ACCESS_KEY,
    bucket: r2.R2_BUCKET,
    publicUrl: r2.R2_PUBLIC_URL,
  };
}

let _clerkWebhook: z.infer<typeof clerkWebhookSchema> | undefined;
export function getClerkWebhookEnv() {
  return (_clerkWebhook ??= parseOrThrow(clerkWebhookSchema as unknown as z.ZodType<z.infer<typeof clerkWebhookSchema>>, "clerk-webhook"));
}

let _resend: z.infer<typeof resendSchema> | undefined;
export function getResendEnv() {
  return (_resend ??= parseOrThrow(resendSchema as unknown as z.ZodType<z.infer<typeof resendSchema>>, "resend"));
}

let _common: z.infer<typeof commonSchema> | undefined;
export function getCommonEnv() {
  return (_common ??= parseOrThrow(commonSchema as unknown as z.ZodType<z.infer<typeof commonSchema>>, "common"));
}

export const isAdminEmail = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const { ADMIN_EMAILS } = getCommonEnv();
  return ADMIN_EMAILS.includes(email.toLowerCase());
};
