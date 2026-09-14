"use client";

import { useEffect, useRef } from "react";

/** Poll a conversation endpoint while a thread stays open (no full-page reload). */
export function useConversationPoll(
  enabled: boolean,
  poll: () => Promise<void>,
  intervalMs = 3000,
) {
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    async function tick() {
      if (cancelled) {
        return;
      }
      try {
        await pollRef.current();
      } catch {
        // Background refresh — keep the open thread usable.
      }
    }
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
