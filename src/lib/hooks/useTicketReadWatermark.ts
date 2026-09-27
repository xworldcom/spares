"use client";

import { useCallback, useRef } from "react";
import { patchTicketRead } from "@/lib/api/care";
import { useConversationReadWatermark } from "@/lib/hooks/useConversationReadWatermark";
import type { ServiceTicket } from "@/types";

/** Debounced Care ticket read watermark for customers (staff marks read on GET). */
export function useTicketReadWatermark(
  enabled: boolean,
  ticketId: string,
  threadBump: string,
  onRead?: (ticket: ServiceTicket) => void,
  debounceMs?: number,
) {
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const markRead = useCallback(
    (id: string) =>
      patchTicketRead(id).then((ticket) => {
        onReadRef.current?.(ticket);
        return ticket;
      }),
    [],
  );
  useConversationReadWatermark(enabled, ticketId, threadBump, markRead, debounceMs);
}
