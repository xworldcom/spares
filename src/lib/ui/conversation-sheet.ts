export type ConversationSheetSnap = "peek" | "reply" | "full" | "out";

/** First snap when the conversation sheet mounts or opens from closed. */
export function initialConversationSheetSnap(
  open: boolean,
  desktopStage: boolean,
  /** Mobile: open straight to full when the thread has unread messages. */
  openForUnread = false,
): ConversationSheetSnap {
  if (!open) {
    return "out";
  }
  if (desktopStage) {
    return "reply";
  }
  if (openForUnread) {
    return "full";
  }
  // Ticket/quote + care overlay: rest in the LOW (peek) band when opening.
  if (!desktopStage) {
    return "peek";
  }
  return "reply";
}

/** Sheet heights as CSS lengths — keep in sync with globals.css. */
export const CONVERSATION_SHEET_PEEK_H = "5.75rem";
export const CONVERSATION_SHEET_PEEK_CHROME_H = "2.85rem";
export const CONVERSATION_SHEET_TITLE_FONT_PX = 15;
export const CONVERSATION_SHEET_CLOSE_FONT_PX = 14;
export const CONVERSATION_SHEET_DRAG_HANDLE_W_REM = 2.6;
export const CONVERSATION_SHEET_DRAG_HANDLE_H_REM = 0.28;
/** Kevin intermediate: handle + header + latest + composer above tab bar. */
export const CONVERSATION_SHEET_REPLY_H = "17.5rem";
export const CONVERSATION_SHEET_FULL_H =
  "min(92dvh, calc(100dvh - var(--spares-header) - var(--spares-tabbar) - 0.5rem))";

export const REPLY_DETENT_PX = 32;
export const PEEK_LAYOUT_BAND_PX = 4;

export type ConversationSheetMotion = {
  phaseA: number;
  phaseB: number;
};

export type ConversationSheetGesture = "expanding" | "collapsing";

/** Roll-up progress: intermediate (reply) → full. Composer stays glued (phaseA pinned). */
export function conversationSheetMotionFromHeight(
  heightPx: number,
  _peekH: number,
  replyH: number,
  fullH: number,
): ConversationSheetMotion {
  if (heightPx <= replyH) {
    return { phaseA: 1, phaseB: 0 };
  }
  if (heightPx >= fullH) {
    return { phaseA: 1, phaseB: 1 };
  }
  const span = Math.max(fullH - replyH, 1);
  const phaseB = (heightPx - replyH) / span;
  return { phaseA: 1, phaseB: Math.min(1, Math.max(0, phaseB)) };
}

export function conversationSheetSnapFromHeight(
  heightPx: number,
  peekH: number,
  replyH: number,
  fullH: number,
): ConversationSheetSnap {
  if (heightPx >= fullH - 2) {
    return "full";
  }
  if (heightPx <= peekH + PEEK_LAYOUT_BAND_PX) {
    return "peek";
  }
  if (heightPx <= replyH + PEEK_LAYOUT_BAND_PX) {
    return "reply";
  }
  const mid = (replyH + fullH) / 2;
  return heightPx < mid ? "reply" : "full";
}

export function chromeSnapForHeight(
  height: number,
  peekH: number,
  replyH: number,
  fullH: number,
  opts?: { collapsing?: boolean; expanding?: boolean },
): ConversationSheetSnap {
  const midReplyFull = (replyH + fullH) / 2;
  if (height <= replyH + PEEK_LAYOUT_BAND_PX) {
    return "reply";
  }
  if (opts?.collapsing) {
    return height < midReplyFull ? "reply" : "full";
  }
  if (opts?.expanding) {
    return height < midReplyFull ? "reply" : "full";
  }
  if (height < midReplyFull) {
    return "reply";
  }
  return "full";
}

/** Snap on pointer-up from live height + velocity (peek / reply / full detents). */
export function conversationSheetReleaseSnap(
  heightPx: number,
  velocity: number,
  peekH: number,
  replyH: number,
  fullH: number,
): ConversationSheetSnap {
  const peekReplyMid = (peekH + replyH) / 2;
  const replyFullMid = (replyH + fullH) / 2;
  if (velocity < -0.45) {
    return "full";
  }
  if (velocity > 0.45) {
    return heightPx > peekReplyMid ? "reply" : "peek";
  }
  if (heightPx <= peekReplyMid) {
    return "peek";
  }
  if (heightPx < replyFullMid) {
    return "reply";
  }
  return "full";
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
  // Continuous collapse: never catch at intermediate; release snap picks detents.
  return Math.max(peekH, Math.min(fullH, startH - dy));
}
