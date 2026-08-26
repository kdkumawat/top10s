"use client";

import { useState } from "react";
import { Share2, Check, Copy } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Props = {
  url: string;
  label: string;
  className?: string;
};

/**
 * Share button. Uses navigator.share when available (mobile), else falls
 * back to copying the URL to clipboard with a transient checkmark.
 */
export function ShareButton({ url, label, className }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const onClick = async () => {
    setError(false);
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: label, url });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 1800);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Share ${label}`}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-md border border-border bg-surface text-fg-muted transition-colors",
        "hover:border-primary hover:text-primary",
        copied && "border-accent text-accent",
        error && "border-danger text-danger",
        className,
      )}
    >
      {copied ? (
        <Check className="size-4" aria-hidden />
      ) : error ? (
        <Copy className="size-4" aria-hidden />
      ) : (
        <Share2 className="size-4" aria-hidden />
      )}
    </button>
  );
}
