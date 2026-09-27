"use client";

import { useConversationSheetChrome } from "@/components/chat/ConversationSheetContext";
import { useDesktopStage } from "@/components/machine/useDesktopStage";
import { useTicketReadWatermark } from "@/lib/hooks/useTicketReadWatermark";
import { conversationReadVisible } from "@/lib/ui/conversation-read-visible";
import type { ServiceTicket } from "@/types";

/** Marks a Care ticket read once the conversation is actually visible. */
export function ConversationReadWatermark({
  enabled,
  ticketId,
  threadBump,
  layout,
  onRead,
}: {
  enabled: boolean;
  ticketId: string;
  threadBump: string;
  layout: "overlay" | "inline";
  onRead: (ticket: ServiceTicket) => void;
}) {
  const desktop = useDesktopStage();
  const chrome = useConversationSheetChrome();
  const visible = conversationReadVisible(chrome?.snap, layout, desktop);
  useTicketReadWatermark(enabled && visible, ticketId, threadBump, onRead);
  return null;
}
