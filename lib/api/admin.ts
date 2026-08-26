import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/clerk";
import { ForbiddenError, AuthError } from "@/lib/errors";

/**
 * Wrap a route handler so it requires an admin Clerk user.
 * Returns either the handler's Response, or a 401/403 JSON.
 *
 * The inner handler receives the unwrapped `params` directly (Next.js's
 * `{ params: P }` is destructured for you).
 */
export function withAdmin<P>(
  handler: (req: NextRequest, params: P) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      await requireAdmin();
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json(
          { error: { code: "unauthorized", message: "Sign-in required" } },
          { status: 401 },
        );
      }
      if (err instanceof ForbiddenError) {
        return NextResponse.json(
          { error: { code: "forbidden", message: err.message } },
          { status: 403 },
        );
      }
      throw err;
    }
    const params = await ctx.params;
    return handler(req, params);
  };
}
