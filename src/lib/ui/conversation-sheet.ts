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
/** Latest context + grab + composer; history opens on the way to full. */
export const CONVERSATION_SHEET_REPLY_H = "12.5rem";
export const CONVERSATION_SHEET_FULL_H =
  "min(92dvh, calc(100dvh - var(--spares-tabbar) - 3rem))";

/** Extra upward travel held at reply so the type bar sits before history rolls in. */
export const REPLY_DETENT_PX = 32;

/**
 * Live sheet height while dragging. From peek, the first pull stops at reply
 * (composer seats) and only leftover travel grows toward full (rollout).
 * `dy` is pointer delta: negative is up (taller sheet).
 */
export function conversationSheetDragHeight({
  from,
  startH,
  dy,
  peekH,
  replyH,
  fullH,
}: {
  from: ConversationSheetSnap;
  startH: number;
  dy: number;
  peekH: number;
  replyH: number;
  fullH: number;
}): number {
  const raw = Math.max(peekH, Math.min(fullH, startH - dy));
  if (from !== "peek") {
    return raw;
  }
  if (raw <= replyH) {
    return raw;
  }
  const past = raw - replyH;
  if (past <= REPLY_DETENT_PX) {
    return replyH;
  }
  return Math.min(fullH, replyH + (past - REPLY_DETENT_PX));
}
