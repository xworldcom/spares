"use client";

import { useEffect, useRef } from "react";
import { patchTicketRead } from "@/lib/api/care";

const DEFAULT_DEBOUNCE_MS = 1200;

/** Debounced Care ticket read watermark for customers (staff marks read on GET). */
export function useTicketReadWatermark(
  enabled: boolean,
  ticketId: string,
  /** Changes when the thread changes so read watermarks refresh while open. */
  threadBump: string,
  debounceMs = DEFAULT_DEBOUNCE_MS,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    lastSentRef.current = null;
  }, [ticketId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const token = `${ticketId}:${threadBump}`;
      if (lastSentRef.current === token) {
        return;
      }
      lastSentRef.current = token;
      void patchTicketRead(ticketId).catch(() => {
        lastSentRef.current = null;
      });
    }, debounceMs);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, ticketId, threadBump, debounceMs]);
}
