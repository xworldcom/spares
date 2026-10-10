"use client";

import { useEffect, useRef } from "react";

const POLL_MS = 3_500;

/** Lightweight If-None-Match poll when a record is open (complements chat watch). */
export function useRecordFreshnessPoll(
  enabled: boolean,
  path: string | null,
  etag: string | null | undefined,
  onFresh: () => Promise<void>,
) {
  const etagRef = useRef(etag);
  etagRef.current = etag;
  const onFreshRef = useRef(onFresh);
  onFreshRef.current = onFresh;

  useEffect(() => {
    if (!enabled || !path) {
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled || document.visibilityState === "hidden") {
        return;
      }
      const tag = etagRef.current;
      try {
        const response = await fetch(path, {
          credentials: "include",
          cache: "no-store",
          headers: tag ? { "If-None-Match": tag } : undefined,
        });
        if (response.status === 200) {
          await onFreshRef.current();
        }
      } catch {
        // Offline or transient — chat watch still covers updates.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, path]);
}
