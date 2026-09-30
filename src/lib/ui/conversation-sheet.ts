export type ConversationSheetSnap = "peek" | "reply" | "full" | "out";

/** First snap when the conversation sheet mounts or opens from closed. */
export function initialConversationSheetSnap(
  open: boolean,
  desktopStage: boolean,
  /** Mobile: open straight to reply when the thread has unread messages. */
  openForUnread = false,
): ConversationSheetSnap {
  if (!open) {
    return "out";
  }
  // Desktop overlay (rare) opens ready to type; mobile starts at the latest-context peek.
  if (desktopStage) {
    return "reply";
  }
  if (openForUnread) {
    return "reply";
  }
  return "peek";
}

/** Sheet heights as CSS lengths — keep in sync with globals.css. */
export const CONVERSATION_SHEET_PEEK_H = "5.75rem";
/** Latest context + composer; history opens on the way to full. */
export const CONVERSATION_SHEET_REPLY_H = "10.25rem";
export const CONVERSATION_SHEET_FULL_H =
  "min(92dvh, calc(100dvh - var(--spares-header) - var(--spares-tabbar) - 0.5rem))";

/** Extra upward travel held at reply so the type bar sits before history rolls in. */
export const REPLY_DETENT_PX = 32;

/**
 * Live sheet height while dragging. From peek, the first pull stops at reply
 * (composer seats) and only leftover travel grows toward full (rollout).
 * `dy` is pointer delta: negative is up (taller sheet).
 */
/** Visual snap from live sheet height (no velocity) — matches resting stage while dragging. */
export function chromeSnapForHeight(
  height: number,
  peekH: number,
  replyH: number,
  fullH: number,
): ConversationSheetSnap {
  const midPeekReply = (peekH + replyH) / 2;
  const midReplyFull = (replyH + fullH) / 2;
  if (height < midPeekReply) {
    return "peek";
  }
  if (height < midReplyFull) {
    return "reply";
  }
  return "full";
}

/**
 * While dragging, expand the composer only when opening (peek→reply) or in reply/full
 * chrome — not when collapsing toward peek.
 */
export function dragComposerLift(
  chromeSnap: ConversationSheetSnap,
  dragFrom: ConversationSheetSnap,
  dy: number,
): boolean {
  if (dragFrom === "peek" && dy < 0) {
    return true;
  }
  if (chromeSnap === "peek") {
    return false;
  }
  return chromeSnap === "reply" || chromeSnap === "full";
}

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
  // First pull never grows past reply — the type bar seats, then rollout
  // starts only after the gesture promotes to reply (or a second pull).
  return Math.max(peekH, Math.min(replyH, raw));
}
