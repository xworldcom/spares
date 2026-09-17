"use client";

import { useEffect, useRef } from "react";
import { CONVERSATION_POLL_MS } from "@/lib/hooks/conversation-poll-constants";

/** Poll a conversation endpoint while a thread stays open (no full-page reload). */
export function useConversationPoll(
  enabled: boolean,
  poll: () => Promise<void>,
  intervalMs = CONVERSATION_POLL_MS,
) {
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    let inFlight = false;
    async function tick() {
      if (cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        await pollRef.current();
      } catch {
        // Background refresh — keep the open thread usable.
      } finally {
        inFlight = false;
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void tick();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
