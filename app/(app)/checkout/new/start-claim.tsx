"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Client component that POSTs /api/claims on mount and redirects to the
 * resulting /checkout/[claimId] page. Shows a spinner + retry on error.
 */
export function StartClaim({
  listingId,
  targetRank,
}: {
  listingId: string;
  targetRank: number;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(true);

  const start = React.useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, targetRank }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      router.replace(`/checkout/${json.claimId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start claim");
      setPending(false);
    }
  }, [listingId, targetRank, router]);

  React.useEffect(() => {
    void start();
  }, [start]);

  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-danger/40 bg-danger/10 p-6 text-center">
        <AlertCircle className="mx-auto size-8 text-danger" />
        <p className="mt-2 text-fg">{error}</p>
        <Button onClick={start} className="mt-4">
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-border bg-surface p-8 text-center">
      <Loader2 className="mx-auto size-8 animate-spin text-primary" />
      <p className="mt-3 text-sm text-fg-muted">
        Preparing claim for #{targetRank}…
      </p>
    </div>
  );
}
