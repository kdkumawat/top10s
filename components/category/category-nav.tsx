import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CategoryWithCount } from "@/lib/db/queries/categories";

export function CategoryNav({
  categories,
  activeSlug,
}: {
  categories: CategoryWithCount[];
  activeSlug?: string;
}) {
  const total = categories.reduce((sum, c) => sum + c.count, 0);
  return (
    <nav
      aria-label="Categories"
      className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex snap-x snap-mandatory items-center gap-2 pb-1">
        <li className="snap-start">
          <Pill
            href="/"
            active={!activeSlug}
            label="All"
            count={total}
          />
        </li>
        {categories.map((c) => (
          <li key={c.id} className="snap-start">
            <Pill
              href={`/c/${c.slug}`}
              active={activeSlug === c.slug}
              label={c.name}
              count={c.count}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Pill({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 font-display text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-fg"
          : "border-border bg-surface text-fg-muted hover:border-primary hover:text-primary",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
          active
            ? "bg-primary-fg/15 text-primary-fg"
            : "bg-surface-elevated text-fg-subtle",
        )}
      >
        {count}
      </span>
    </Link>
  );
}
