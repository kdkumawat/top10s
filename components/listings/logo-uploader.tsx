"use client";

import * as React from "react";
import { Upload, X, ImageIcon as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PresignedUpload = {
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  publicUrl: string;
  key: string;
};

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "done"; url: string }
  | { kind: "error"; message: string };

const ALLOWED = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_BYTES = 2 * 1024 * 1024;

export function LogoUploader({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const [state, setState] = React.useState<UploadState>(
    value ? { kind: "done", url: value } : { kind: "idle" },
  );
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keep state in sync if parent resets the value.
  React.useEffect(() => {
    if (!value && state.kind === "done") setState({ kind: "idle" });
    if (value && (state.kind === "idle" || state.kind === "error")) {
      setState({ kind: "done", url: value });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function handleFile(file: File) {
    if (!ALLOWED.includes(file.type as (typeof ALLOWED)[number])) {
      setState({ kind: "error", message: "PNG, JPEG, or WebP only" });
      return;
    }
    if (file.size > MAX_BYTES) {
      setState({ kind: "error", message: "Max 2MB" });
      return;
    }

    setState({ kind: "uploading" });

    try {
      const presignRes = await fetch("/api/uploads/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!presignRes.ok) {
        const j = await presignRes.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${presignRes.status}`);
      }
      const presigned: PresignedUpload = await presignRes.json();

      const putRes = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: presigned.uploadHeaders,
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed: HTTP ${putRes.status}`);

      setState({ kind: "done", url: presigned.publicUrl });
      onChange(presigned.publicUrl);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function clear() {
    if (disabled) return;
    setState({ kind: "idle" });
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor="logo-drop"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/10"
            : "border-border bg-surface hover:border-primary/60",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {state.kind === "done" ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.url}
              alt="Logo preview"
              className="size-20 rounded-md object-cover"
            />
            <p className="font-mono text-xs text-fg-subtle">
              {state.url.split("/").pop()}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                clear();
              }}
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-danger"
            >
              <X className="size-3" /> Remove
            </button>
          </div>
        ) : state.kind === "uploading" ? (
          <>
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-fg-muted">Uploading…</p>
          </>
        ) : (
          <>
            {state.kind === "error" ? (
              <ImageIcon className="size-8 text-danger" />
            ) : (
              <Upload className="size-8 text-fg-muted" />
            )}
            <p className="text-sm text-fg">
              {state.kind === "error" ? state.message : "Drop logo or click"}
            </p>
            <p className="font-mono text-xs text-fg-subtle">
              PNG / JPEG / WebP · max 2MB
            </p>
          </>
        )}
        <input
          ref={inputRef}
          id="logo-drop"
          type="file"
          accept={ALLOWED.join(",")}
          onChange={onPick}
          disabled={disabled}
          className="sr-only"
        />
      </label>
    </div>
  );
}
