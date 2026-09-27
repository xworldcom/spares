"use client";

import { patchQuoteRead } from "@/lib/api/quotes";
import { useConversationReadWatermark } from "@/lib/hooks/useConversationReadWatermark";

/** Debounced quote read watermark for customers (staff marks read on GET). */
export function useQuoteReadWatermark(
  enabled: boolean,
  quoteId: string,
  threadBump: string,
  debounceMs?: number,
) {
  useConversationReadWatermark(enabled, quoteId, threadBump, patchQuoteRead, debounceMs);
}
