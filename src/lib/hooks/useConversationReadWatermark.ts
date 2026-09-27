"use client";

import { useEffect, useRef } from "react";

const DEFAULT_DEBOUNCE_MS = 1200;

/** Debounced read watermark while a Care or quote thread stays open. */
export function useConversationReadWatermark(
  enabled: boolean,
  conversationId: string,
  /** Changes when the thread changes so read watermarks refresh while open. */
  threadBump: string,
  markRead: (id: string) => Promise<unknown>,
  debounceMs = DEFAULT_DEBOUNCE_MS,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    lastSentRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const token = `${conversationId}:${threadBump}`;
      if (lastSentRef.current === token) {
        return;
      }
      lastSentRef.current = token;
      void markRead(conversationId).catch(() => {
        lastSentRef.current = null;
      });
    }, debounceMs);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, conversationId, threadBump, debounceMs, markRead]);
}
