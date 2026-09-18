export type ConversationSheetSnap = "peek" | "reply" | "full" | "out";

/** First snap when the conversation sheet mounts or opens from closed. */
export function initialConversationSheetSnap(
  open: boolean,
  desktopStage: boolean,
): ConversationSheetSnap {
  if (!open) {
    return "out";
  }
  // Desktop overlay (rare) opens ready to type; mobile starts at the latest-context peek.
  return desktopStage ? "reply" : "peek";
}

/** Sheet heights as CSS lengths — keep in sync with globals.css. */
export const CONVERSATION_SHEET_PEEK_H = "5.75rem";
export const CONVERSATION_SHEET_REPLY_H = "16.5rem";
export const CONVERSATION_SHEET_FULL_H =
  "min(92dvh, calc(100dvh - var(--spares-tabbar) - 3rem))";
