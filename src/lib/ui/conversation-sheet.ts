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
  // Chunk 2: resting closed = header + peek of thread; composer below tab bar.
  return "peek";
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
/** Minimum height band between reply and full so phase B is a real drag segment. */
export const MIN_PHASE_B_BAND_PX = 56;
/** Small flicks from peek must not seat the composer; require a real pull. */
export const COMPOSER_REVEAL_PULL_PX = 48;

export type ConversationSheetDetents = {
  peekH: number;
  replyH: number;
  fullH: number;
};

/** Keep reply strictly between peek+composer and full on short viewports. */
export function resolveConversationSheetDetents(
  peekH: number,
  replyH: number,
  fullH: number,
  composerH: number,
): ConversationSheetDetents {
  const peek = Math.round(peekH);
  const full = Math.round(fullH);
  const minReply = Math.round(peek + composerH + 8);
  const maxReply = Math.max(minReply, full - MIN_PHASE_B_BAND_PX);
  let reply = Math.round(replyH);
  reply = Math.max(reply, minReply);
  reply = Math.min(reply, maxReply);
  if (reply >= full) {
    reply = Math.max(minReply, full - MIN_PHASE_B_BAND_PX);
  }
  return { peekH: peek, replyH: reply, fullH: full };
}

export type ConversationSheetMotion = {
  phaseA: number;
  phaseB: number;
};

export type ConversationSheetGesture = "expanding" | "collapsing";

/** Phase A = composer seat (peek→reply); phase B = history roll-up (reply→full). */
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
  if (opts?.collapsing) {
    if (height < midReplyFull) {
      return "reply";
    }
    return "full";
  }
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
  void from;
  return Math.max(peekH, Math.min(fullH, startH - dy));
}
