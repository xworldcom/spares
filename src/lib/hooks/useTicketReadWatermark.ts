"use client";

import { patchTicketRead } from "@/lib/api/care";
<<<<<<< HEAD
import { useConversationReadWatermark } from "@/lib/hooks/useConversationReadWatermark";
=======
import type { ServiceTicket } from "@/types";

const DEFAULT_DEBOUNCE_MS = 600;
>>>>>>> 443ee4b (Fix Care ticket unread dots clearing when a thread is read)

/** Debounced Care ticket read watermark for customers (staff marks read on GET). */
export function useTicketReadWatermark(
  enabled: boolean,
  ticketId: string,
  threadBump: string,
<<<<<<< HEAD
  debounceMs?: number,
) {
  useConversationReadWatermark(enabled, ticketId, threadBump, patchTicketRead, debounceMs);
=======
  onRead?: (ticket: ServiceTicket) => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string | null>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

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
      void patchTicketRead(ticketId)
        .then((ticket) => {
          onReadRef.current?.(ticket);
        })
        .catch(() => {
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
>>>>>>> 443ee4b (Fix Care ticket unread dots clearing when a thread is read)
}
