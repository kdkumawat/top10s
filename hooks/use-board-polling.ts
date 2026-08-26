"use client";

import { useEffect, useRef, useState } from "react";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: unknown; etag: string }
  | { status: "error"; error: Error };

type Options = {
  /** Base polling interval in ms. Default 5000. */
  intervalMs?: number;
  /** Faster interval when `fast` is true (e.g. during checkout). Default 2000. */
  fastIntervalMs?: number;
  /** When true, polls at the faster interval. */
  fast?: boolean;
  /** Pause polling while the tab is hidden. Default true. */
  pauseWhenHidden?: boolean;
  /** Disable polling entirely. */
  enabled?: boolean;
};

/**
 * Polls /api/board with ETag-based 304 short-circuiting.
 * Returns the latest parsed body and a refresh function.
 *
 * - Pauses on `document.visibilityState === "hidden"` (default).
 * - Sends `If-None-Match` from the last response; 304 = no state change.
 * - Aborts in-flight requests on unmount or before each new poll.
 */
export function useBoardPolling(options: Options = {}) {
  const {
    intervalMs = 5_000,
    fastIntervalMs = 2_000,
    fast = false,
    pauseWhenHidden = true,
    enabled = true,
  } = options;

  const [state, setState] = useState<FetchState>({ status: "idle" });
  const etagRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchOnce = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => (s.status === "ok" ? s : { status: "loading" }));
    try {
      const res = await fetch("/api/board", {
        signal: ctrl.signal,
        headers: etagRef.current ? { "If-None-Match": etagRef.current } : {},
        cache: "no-store",
      });
      if (res.status === 304) {
        // No change. Keep current state.
        return;
      }
      if (!res.ok) {
        throw new Error(`Board fetch failed: ${res.status}`);
      }
      const etag = res.headers.get("etag");
      const data = await res.json();
      etagRef.current = etag;
      setState({ status: "ok", data, etag: etag ?? "" });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ status: "error", error: err as Error });
    }
  };

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (pauseWhenHidden && document.hidden) {
        timer = setTimeout(tick, intervalMs);
        return;
      }
      await fetchOnce();
      const next = fast ? fastIntervalMs : intervalMs;
      timer = setTimeout(tick, next);
    };

    // Kick off immediately.
    void tick();

    const onVisibility = () => {
      if (!document.hidden) void fetchOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fast, fastIntervalMs, intervalMs, pauseWhenHidden]);

  return { state, refresh: fetchOnce };
}
