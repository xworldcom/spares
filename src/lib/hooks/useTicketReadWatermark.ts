"use client";

import { patchTicketRead } from "@/lib/api/care";
import { useConversationReadWatermark } from "@/lib/hooks/useConversationReadWatermark";

/** Debounced Care ticket read watermark for customers (staff marks read on GET). */
export function useTicketReadWatermark(
  enabled: boolean,
  ticketId: string,
  threadBump: string,
  debounceMs?: number,
) {
  useConversationReadWatermark(enabled, ticketId, threadBump, patchTicketRead, debounceMs);
}
