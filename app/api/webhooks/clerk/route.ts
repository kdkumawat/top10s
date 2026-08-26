import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isAdminEmail } from "@/lib/env";

/**
 * Clerk user-sync webhook.
 * URL: /api/webhooks/clerk (configure in Clerk dashboard → Webhooks)
 * Events: user.created, user.updated, user.deleted
 *
 * Signing secret: CLERK_WEBHOOK_SECRET (whsec_…)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClerkUserEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    email_addresses?: Array<{ id: string; email_address: string }>;
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
  };
};

export async function POST(req: NextRequest) {
  let evt: ClerkUserEvent;
  try {
    evt = (await verifyWebhook(req)) as ClerkUserEvent;
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_signature",
          message: err instanceof Error ? err.message : "Signature verification failed",
        },
      },
      { status: 400 },
    );
  }

  try {
    if (evt.type === "user.created" || evt.type === "user.updated") {
      const u = evt.data;
      const primary =
        u.email_addresses?.find((e) => e.id === u.primary_email_address_id)
          ?.email_address ?? u.email_addresses?.[0]?.email_address;
      if (!primary) {
        return NextResponse.json(
          { error: { code: "no_email", message: "Clerk user has no email" } },
          { status: 400 },
        );
      }
      const name =
        [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null;
      const shouldBeAdmin = isAdminEmail(primary);

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, u.id))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(users).values({
          clerkId: u.id,
          email: primary,
          name,
          isAdmin: shouldBeAdmin,
          isSuspended: false,
        });
      } else {
        const updates: Partial<typeof users.$inferInsert> = {
          email: primary,
          name,
        };
        if (shouldBeAdmin) updates.isAdmin = true;
        await db
          .update(users)
          .set(updates)
          .where(eq(users.clerkId, u.id));
      }
    } else if (evt.type === "user.deleted") {
      // Soft-handle: mark suspended so any stale positions stay defensible.
      // Hard delete is deferred to GDPR Phase 14+ (PII policy).
      await db
        .update(users)
        .set({ isSuspended: true })
        .where(eq(users.clerkId, evt.data.id));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[webhook clerk] handler error", err);
    return NextResponse.json(
      { error: { code: "handler_failed", message: "Internal error" } },
      { status: 500 },
    );
  }
}
