import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { LayoutDashboard, Plus, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth/clerk";
import { errorResponse } from "@/lib/api/respond";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Layout for /dashboard, /checkout, /admin. Runs requireUser server-side.
 * Wraps in a vertical shell with a sticky top nav.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    // Middleware already protected, but belt-and-suspenders for direct RSC access.
    const res = errorResponse(err);
    if (res.status === 401 || res.status === 403) redirect("/");
    throw err;
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className={cn(
              "font-display text-2xl text-gold",
              "transition-transform hover:-translate-y-0.5",
            )}
          >
            top10s.lol
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2">
            <NavLink href="/dashboard" icon={<LayoutDashboard className="size-4" />}>
              Dashboard
            </NavLink>
            <NavLink href="/dashboard/new" icon={<Plus className="size-4" />}>
              New listing
            </NavLink>
            {user.isAdmin && (
              <NavLink href="/admin" icon={<LogOut className="size-4" />}>
                Admin
              </NavLink>
            )}
            <div className="ml-2 flex items-center gap-2">
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "size-8",
                  },
                }}
                afterSignOutUrl="/"
              />
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  children,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
        "text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}
