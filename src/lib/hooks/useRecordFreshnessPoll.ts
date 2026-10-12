"use client";

import { useEffect, useRef } from "react";
import { RECORD_FRESHNESS_POLL_MS } from "@/lib/hooks/conversation-poll-constants";

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
    if (!enabled || path == null || path === "") {
      return;
    }
    const fetchPath: string = path;
    let cancelled = false;

    async function checkFresh() {
      if (cancelled || document.visibilityState === "hidden") {
        return;
      }
      const tag = etagRef.current;
      try {
        const response = await fetch(fetchPath, {
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
    }

    const timer = window.setInterval(() => {
      void checkFresh();
    }, RECORD_FRESHNESS_POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") {
        void checkFresh();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, path]);
}
