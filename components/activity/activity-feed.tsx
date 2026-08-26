"use client";

import * as React from "react";
import useSWR from "swr";
import { Flame, Swords, Rocket, Zap, Activity as ActivityIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatUsdFromPaise } from "@/lib/money";
import { formatRelative } from "@/lib/format-relative";

type Item = {
  id: number;
  kind: string;
  listingId: string | null;
  listingName: string | null;
  listingSlug: string | null;
  userName: string | null;
  rank: number | null;
  amount: number;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<{ items: Item[] }>);

export function ActivityFeed({ initialItems }: { initialItems: Item[] }) {
  const { data } = useSWR("/api/activity?limit=20", fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
    fallbackData: { items: initialItems },
  });

  const items = data?.items ?? initialItems;

  return (
    <section
      aria-label="Live activity"
      aria-live="polite"
      className="rounded-lg border border-border bg-surface"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-lg text-fg">
          <ActivityIcon className="size-4 text-primary" />
          Live activity
        </h2>
        <span className="flex items-center gap-1.5 font-mono text-xs text-fg-subtle">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          live
        </span>
      </header>
      <ul className="max-h-[480px] overflow-y-auto px-2 py-2">
        {items.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-fg-subtle">
            No activity yet. Be the first to claim.
          </li>
        ) : (
          items.map((it) => <ActivityItemRow key={it.id} item={it} />)
        )}
      </ul>
    </section>
  );
}

function ActivityItemRow({ item }: { item: Item }) {
  const { Icon, color, verb } = iconFor(item.kind);
  const who = item.userName ?? "Someone";
  const what = item.listingName ?? "a listing";
  const usd = formatUsdFromPaise(item.amount);
  const rank = item.rank ? `#${item.rank}` : null;
  const href = rank ? `/${item.rank}` : item.listingSlug ? `/${item.listingSlug}` : "#";

  return (
    <li
      className={cn(
        "group flex items-start gap-2 rounded-md px-2 py-2",
        "transition-colors hover:bg-surface-elevated",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
          "bg-surface-elevated",
        )}
      >
        <Icon className={cn("size-3.5", color)} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <p className="text-fg">
          <span className="font-medium">{who}</span>{" "}
          <span className="text-fg-muted">{verb}</span>{" "}
          {rank ? (
            <a
              href={href}
              className="font-mono font-medium text-primary hover:underline"
            >
              {rank}
            </a>
          ) : (
            <a
              href={href}
              className="font-medium text-primary hover:underline"
            >
              {what}
            </a>
          )}
          {item.amount > 0 && (
            <>
              {" "}
              <span className="font-mono text-xs text-accent">for {usd}</span>
            </>
          )}
        </p>
        <time
          className="font-mono text-xs text-fg-subtle"
          dateTime={item.createdAt}
        >
          {formatRelative(item.createdAt)}
        </time>
      </div>
    </li>
  );
}

function iconFor(kind: string): {
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  verb: string;
} {
  switch (kind) {
    case "claim":
      return { Icon: Flame, color: "text-accent", verb: "claimed" };
    case "outbid":
      return { Icon: Swords, color: "text-urgency", verb: "outbid" };
    case "pushed_out":
      return { Icon: Swords, color: "text-danger", verb: "was pushed from" };
    case "removed":
      return { Icon: Zap, color: "text-danger", verb: "fell off" };
    default:
      return { Icon: Rocket, color: "text-fg-muted", verb: "did something on" };
  }
}
