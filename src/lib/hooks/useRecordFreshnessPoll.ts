"use client";

import { useEffect, useRef } from "react";
import { RECORD_FRESHNESS_POLL_MS } from "@/lib/hooks/conversation-poll-constants";

/** Lightweight If-None-Match poll when a record is open (complements chat watch). */
export function useRecordFreshnessPoll(
  enabled: boolean,
  path: string | null,
  etag: string | null | undefined,
  onFresh: () => Promise<void>,
  onPollError?: (message: string | null) => void,
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
          onPollError?.(null);
        } else if (response.status >= 500) {
          onPollError?.("Could not refresh this record. Try again.");
        }
      } catch {
        onPollError?.(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "You appear to be offline. Check your connection and try again."
            : "Could not reach OEE360. Check your network and try again.",
        );
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
