import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/checkout(.*)",
  "/admin(.*)",
  "/api/me(.*)",
  "/api/listings(.*)",
  "/api/claims(.*)",
  "/api/uploads(.*)",
  "/api/admin(.*)",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);

// State-changing API methods must carry an Origin/Referer matching the app.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const isApiMutating = (req: NextRequest) =>
  req.nextUrl.pathname.startsWith("/api/") &&
  MUTATING_METHODS.has(req.method.toUpperCase());

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  // Admin gate is enforced server-side in route handlers/layouts via requireAdmin().
  if (isAdminRoute(req)) {
    await auth.protect();
  }

  // CSRF: reject state-changing API requests whose Origin doesn't match the app URL.
  // The webhook routes are exempt — they sign with HMAC, not cookies.
  if (isApiMutating(req) && !req.nextUrl.pathname.startsWith("/api/webhooks/")) {
    if (!hasValidOrigin(req)) {
      return NextResponse.json(
        { error: { code: "csrf", message: "Invalid origin" } },
        { status: 403 },
      );
    }
  }
});

/**
 * Returns true if the request's Origin (or Referer fallback) matches the
 * configured NEXT_PUBLIC_APP_URL. Allows null Origin in dev for tools like
 * curl that omit the header.
 */
function hasValidOrigin(req: NextRequest): boolean {
  const expected = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!expected) {
    // In dev without NEXT_PUBLIC_APP_URL, allow anything.
    return true;
  }
  const expectedHost = safeHost(expected);
  if (!expectedHost) return true;

  const origin = req.headers.get("origin");
  if (origin) {
    return safeHost(origin) === expectedHost;
  }
  // Some clients omit Origin on same-origin POSTs; fall back to Referer.
  const referer = req.headers.get("referer");
  if (referer) {
    return safeHost(referer) === expectedHost;
  }
  // No origin headers — likely a non-browser tool. In dev allow; in prod
  // require at least one. Same-origin form posts typically include either.
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

function safeHost(url: string): string | null {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    "/((?!_next|.*\\..*).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
