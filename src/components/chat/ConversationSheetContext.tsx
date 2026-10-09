"use client";

import { createContext, useContext } from "react";
import type { ConversationSheetSnap } from "@/lib/ui/conversation-sheet";

export type ConversationSheetChrome = {
  snap: ConversationSheetSnap;
  dragging: boolean;
  /** Latest row pinned above composer; false when user scrolled history at full. */
  threadDocked: boolean;
  /** Close translate / closed snap: feed must not pin or write scrollTop. */
  threadScrollLocked: boolean;
  collapse: () => void;
  /** Desktop split pane: a normal top-down scroller, not the flex-end bottom-glued sheet. */
  inline?: boolean;
};

const ConversationSheetContext = createContext<ConversationSheetChrome | null>(null);

export function ConversationSheetProvider({
  value,
  children,
}: {
  value: ConversationSheetChrome;
  children: React.ReactNode;
}) {
  return (
    <ConversationSheetContext.Provider value={value}>{children}</ConversationSheetContext.Provider>
  );
}

export function useConversationSheetChrome() {
  return useContext(ConversationSheetContext);
}
