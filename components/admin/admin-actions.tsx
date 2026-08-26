"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Snowflake, Trash2, RefreshCw, Pause, Play, AlertCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Action = "freeze" | "remove" | "refund" | "suspend";

type Props = {
  action: Action;
  target:
    | { kind: "rank"; rank: number; frozen?: boolean }
    | { kind: "bid"; id: string }
    | { kind: "user"; id: string; suspended?: boolean };
  className?: string;
};

export function AdminAction({ action, target, className }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = async (body: Record<string, unknown>) => {
    setError(null);
    const url = urlFor(action, target);
    if (!url) return;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(data?.error?.message ?? `HTTP ${res.status}`);
      return;
    }
    startTransition(() => router.refresh());
  };

  switch (action) {
    case "freeze": {
      if (target.kind !== "rank") return null;
      return (
        <button
          type="button"
          disabled={isPending}
          onClick={() => submit({ frozen: !target.frozen })}
          className={cn(actionButtonClass, className)}
          aria-label={target.frozen ? "Unfreeze" : "Freeze"}
        >
          {target.frozen ? <Play className="size-3.5" /> : <Snowflake className="size-3.5" />}
          {target.frozen ? "Unfreeze" : "Freeze"}
        </button>
      );
    }
    case "remove": {
      if (target.kind !== "rank") return null;
      return (
        <ConfirmButton
          message={`Clear position #${target.rank}? The spot will empty and the listing will be removed from the board (gap stays).`}
          onConfirm={() => submit({})}
          isPending={isPending}
          className={cn(actionButtonClass, "border-danger/40 text-danger hover:bg-danger/10", className)}
          label="Remove"
        />
      );
    }
    case "refund": {
      if (target.kind !== "bid") return null;
      return (
        <ConfirmButton
          message="Refund this bid? The position will clear (gap stays). This calls Razorpay and cannot be undone."
          onConfirm={() => submit({})}
          isPending={isPending}
          className={cn(actionButtonClass, "border-danger/40 text-danger hover:bg-danger/10", className)}
          label="Refund"
        />
      );
    }
    case "suspend": {
      if (target.kind !== "user") return null;
      return (
        <button
          type="button"
          disabled={isPending}
          onClick={() => submit({ suspended: !target.suspended })}
          className={cn(actionButtonClass, className)}
          aria-label={target.suspended ? "Unsuspend" : "Suspend"}
        >
          {target.suspended ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {target.suspended ? "Unsuspend" : "Suspend"}
        </button>
      );
    }
  }

  if (error) {
    return (
      <p className="flex items-center gap-1 text-xs text-danger">
        <AlertCircle className="size-3" /> {error}
      </p>
    );
  }
  return null;
}

function urlFor(action: Action, target: Props["target"]): string | null {
  if (action === "freeze" || action === "remove") {
    if (target.kind !== "rank") return null;
    return `/api/admin/positions/${target.rank}/${action}`;
  }
  if (action === "refund") {
    if (target.kind !== "bid") return null;
    return `/api/admin/bids/${target.id}/refund`;
  }
  if (action === "suspend") {
    if (target.kind !== "user") return null;
    return `/api/admin/users/${target.id}/suspend`;
  }
  return null;
}

const actionButtonClass =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-50";

function ConfirmButton({
  message,
  onConfirm,
  isPending,
  className,
  label,
}: {
  message: string;
  onConfirm: () => Promise<void>;
  isPending: boolean;
  className: string;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (typeof window !== "undefined" && window.confirm(message)) {
          void onConfirm();
        }
      }}
      className={className}
    >
      <Trash2 className="size-3.5" />
      {label}
    </button>
  );
}
