"use client";

import { createContext, useContext } from "react";
import type { ConversationSheetSnap } from "@/lib/ui/conversation-sheet";

export type ConversationSheetChrome = {
  snap: ConversationSheetSnap;
  dragging: boolean;
  collapse: () => void;
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
