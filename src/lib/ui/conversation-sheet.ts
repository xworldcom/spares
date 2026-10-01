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
/** Handle + toolbar reserved inside the fixed peek band (see --peek-chrome-h). */
export const CONVERSATION_SHEET_PEEK_CHROME_H = "2.85rem";
/** Toolbar / handle typography — keep in sync with globals.css `--sheet-*` tokens. */
export const CONVERSATION_SHEET_TITLE_FONT_PX = 15;
export const CONVERSATION_SHEET_CLOSE_FONT_PX = 14;
export const CONVERSATION_SHEET_DRAG_HANDLE_W_REM = 2.6;
export const CONVERSATION_SHEET_DRAG_HANDLE_H_REM = 0.28;
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
/** Same band as resting peek snap — keep settle targets in sync. */
export const PEEK_LAYOUT_BAND_PX = 4;

/** Two-phase sheet motion: A = composer slide (peek→reply), B = thread roll (reply→full). */
export type ConversationSheetMotion = {
  phaseA: number;
  phaseB: number;
};

export type ConversationSheetGesture = "expanding" | "collapsing";

/**
 * Outer shell height while dragging. On collapse, phase B rolls the thread inside a
 * full-height shell so the composer stays docked above the tab bar; only phase A
 * shrinks the painted height toward peek.
 */
export function conversationSheetPaintedHeight(
  liveHeightPx: number,
  peekH: number,
  replyH: number,
  fullH: number,
  gesture: ConversationSheetGesture | null,
): number {
  const { phaseB } = conversationSheetMotionFromHeight(
    liveHeightPx,
    peekH,
    replyH,
    fullH,
  );
  if (
    gesture === "collapsing" &&
    phaseB > 0 &&
    liveHeightPx > replyH + PEEK_LAYOUT_BAND_PX
  ) {
    return fullH;
  }
  return liveHeightPx;
}

/** Map live sheet height to phase A/B progress (0–1 each). Height-only — mid-drag matches release. */
export function conversationSheetMotionFromHeight(
  heightPx: number,
  peekH: number,
  replyH: number,
  fullH: number,
): ConversationSheetMotion {
  if (heightPx <= peekH) {
    return { phaseA: 0, phaseB: 0 };
  }
  if (heightPx >= fullH) {
    return { phaseA: 1, phaseB: 1 };
  }
  if (heightPx <= replyH) {
    const span = Math.max(replyH - peekH, 1);
    const phaseA = (heightPx - peekH) / span;
    return { phaseA: Math.min(1, Math.max(0, phaseA)), phaseB: 0 };
  }
  const span = Math.max(fullH - replyH, 1);
  const phaseB = (heightPx - replyH) / span;
  return { phaseA: 1, phaseB: Math.min(1, Math.max(0, phaseB)) };
}

/** Visual snap label from height (no expand/collapse hysteresis). */
export function conversationSheetSnapFromHeight(
  heightPx: number,
  peekH: number,
  replyH: number,
  fullH: number,
): ConversationSheetSnap {
  const { phaseA, phaseB } = conversationSheetMotionFromHeight(
    heightPx,
    peekH,
    replyH,
    fullH,
  );
  if (phaseA < 1 && phaseB === 0) {
    return phaseA < 0.35 ? "peek" : "reply";
  }
  if (phaseB < 1) {
    return "reply";
  }
  return "full";
}

/** Visual snap from live sheet height (no velocity) — matches resting stage while dragging. */
export function chromeSnapForHeight(
  height: number,
  peekH: number,
  replyH: number,
  fullH: number,
  opts?: { collapsing?: boolean; expanding?: boolean },
): ConversationSheetSnap {
  const peekBand = peekH + PEEK_LAYOUT_BAND_PX;
  const midPeekReply = (peekH + replyH) / 2;
  const midReplyFull = (replyH + fullH) / 2;
  if (height <= peekBand) {
    return "peek";
  }
  // Collapsing: keep reply/full chrome until height enters the peek band (no mid-band toolbar flip).
  if (opts?.collapsing) {
    if (height < midReplyFull) {
      return "reply";
    }
    return "full";
  }
  // Expanding: mirror collapse — keep peek chrome until the reply midline (no flip on release).
  if (opts?.expanding) {
    if (height < midPeekReply) {
      return "peek";
    }
    if (height < midReplyFull) {
      return "reply";
    }
    return "full";
  }
  if (height < midPeekReply) {
    return "peek";
  }
  if (height < midReplyFull) {
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
  const raw = Math.max(peekH, Math.min(fullH, startH - dy));
  if (from !== "peek") {
    return raw;
  }
  // First pull never grows past reply — the type bar seats, then rollout
  // starts only after the gesture promotes to reply (or a second pull).
  return Math.max(peekH, Math.min(replyH, raw));
}
