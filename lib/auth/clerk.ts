import "server-only";
import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isAdminEmail, getCommonEnv } from "@/lib/env";
import { AuthError, ForbiddenError } from "@/lib/errors";

export type CurrentUser = {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isSuspended: boolean;
};

/**
 * Resolve the signed-in Clerk user to our local `users` row.
 * Auto-creates the row on first sign-in.
 * Auto-promotes to admin if email is in ADMIN_EMAILS env.
 * Throws AuthError if signed out.
 * Throws ForbiddenError if suspended.
 */
export async function requireUser(): Promise<CurrentUser> {
  const cu = await currentUser();
  if (!cu) throw new AuthError();

  const email =
    cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress;
  if (!email) throw new AuthError("No email on Clerk user");

  const clerkId = cu.id;
  const name =
    [cu.firstName, cu.lastName].filter(Boolean).join(" ").trim() || null;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  const shouldBeAdmin = isAdminEmail(email);

  if (existing.length === 0) {
    const inserted = await db
      .insert(users)
      .values({
        clerkId,
        email,
        name,
        isAdmin: shouldBeAdmin,
        isSuspended: false,
      })
      .returning();
    const row = inserted[0]!;
    return toCurrent(row);
  }

  const row = existing[0]!;

  // Auto-promote admin when env gains their email.
  // Auto-update email/name if Clerk has fresher values.
  const updates: Partial<typeof users.$inferInsert> = {};
  if (row.email !== email) updates.email = email;
  if (row.name !== name) updates.name = name;
  if (shouldBeAdmin && !row.isAdmin) updates.isAdmin = true;
  if (Object.keys(updates).length > 0) {
    const updated = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, row.id))
      .returning();
    return toCurrent(updated[0]!);
  }

  return toCurrent(row);
}

function toCurrent(row: typeof users.$inferSelect): CurrentUser {
  if (row.isSuspended) {
    throw new ForbiddenError("Account suspended");
  }
  return {
    id: row.id,
    clerkId: row.clerkId,
    email: row.email,
    name: row.name,
    isAdmin: row.isAdmin,
    isSuspended: row.isSuspended,
  };
}

/** Same as requireUser but returns null instead of throwing. */
export async function maybeUser(): Promise<CurrentUser | null> {
  try {
    return await requireUser();
  } catch (err) {
    if (err instanceof AuthError) return null;
    throw err;
  }
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) {
    // Touch getCommonEnv so it caches alongside other tiers.
    getCommonEnv();
    throw new ForbiddenError("Admin required");
  }
  return user;
}
