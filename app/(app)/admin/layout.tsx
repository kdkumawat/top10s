import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, Snowflake, History as HistoryIcon, Flag, Settings } from "@/lib/icons";
import { requireAdmin } from "@/lib/auth/clerk";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireAdmin();
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Crown className="size-6 text-gold" aria-hidden />
        <div>
          <h1 className="font-display text-2xl text-fg">Admin</h1>
          <p className="text-xs text-fg-muted">
            Signed in as {user.email}
          </p>
        </div>
      </header>

      <nav
        aria-label="Admin sections"
        className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3"
      >
        <AdminLink href="/admin" icon={<Settings className="size-3.5" />}>
          Overview
        </AdminLink>
        <AdminLink href="/admin/positions" icon={<Snowflake className="size-3.5" />}>
          Positions
        </AdminLink>
        <AdminLink href="/admin/bids" icon={<HistoryIcon className="size-3.5" />}>
          Bids
        </AdminLink>
        <AdminLink href="/admin/users" icon={<Flag className="size-3.5" />}>
          Users
        </AdminLink>
      </nav>

      <div>{children}</div>
    </div>
  );
}

function AdminLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs",
        "text-fg-muted transition-colors hover:border-primary hover:text-primary",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
