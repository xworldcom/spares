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
export const CONVERSATION_SHEET_PEEK_CHROME_H = "2.85rem";
export const CONVERSATION_SHEET_TITLE_FONT_PX = 15;
export const CONVERSATION_SHEET_CLOSE_FONT_PX = 14;
export const CONVERSATION_SHEET_DRAG_HANDLE_W_REM = 2.6;
export const CONVERSATION_SHEET_DRAG_HANDLE_H_REM = 0.28;
/** Kevin intermediate (H_peek): handle + header + latest + composer above tab bar. */
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

export type ConversationSheetMetrics = {
  /** Closed visible band (chrome + latest row, no composer). */
  peekVisibleH: number;
  replyH: number;
  openH: number;
  composerH: number;
  yClosed: number;
  clipBottomClosed: number;
  yIntermediate: number;
  yOpen: number;
};

/** Approach A: fixed H_open; top/bottom clip insets (bottom tucks composer under tabs at closed). */
export function conversationSheetMetrics(
  peekVisibleH: number,
  replyH: number,
  openH: number,
  composerH: number,
): ConversationSheetMetrics {
  const yOpen = 0;
  const clipBottomClosed = Math.max(0, composerH);
  const yIntermediate = Math.max(0, openH - replyH);
  const yClosed = Math.max(0, openH - peekVisibleH - clipBottomClosed);
  return {
    peekVisibleH,
    replyH,
    openH,
    composerH,
    yClosed,
    clipBottomClosed,
    yIntermediate,
    yOpen,
  };
}

export function conversationSheetClipBottomForTop(
  clipTop: number,
  metrics: ConversationSheetMetrics,
): number {
  if (clipTop <= metrics.yIntermediate + 0.5) {
    return 0;
  }
  if (clipTop >= metrics.yClosed - 0.5) {
    return metrics.clipBottomClosed;
  }
  const span = Math.max(metrics.yClosed - metrics.yIntermediate, 1);
  const t = (clipTop - metrics.yIntermediate) / span;
  return metrics.clipBottomClosed * Math.min(1, Math.max(0, t));
}

export function conversationSheetTranslateForSnap(
  snap: ConversationSheetSnap,
  metrics: ConversationSheetMetrics,
): number {
  if (snap === "full") {
    return metrics.yOpen;
  }
  if (snap === "reply") {
    return metrics.yIntermediate;
  }
  if (snap === "peek") {
    return metrics.yClosed;
  }
  return metrics.yClosed;
}

/** Visible height above the tab-bar floor (for probes / debug). */
export function conversationSheetVisibleHeight(
  clipTop: number,
  metrics: ConversationSheetMetrics,
  clipBottom = 0,
): number {
  return Math.max(
    metrics.peekVisibleH,
    metrics.openH - clipTop - clipBottom,
  );
}

export function conversationSheetMotionFromTranslate(
  translateY: number,
  metrics: ConversationSheetMetrics,
): ConversationSheetMotion {
  const { yClosed, yIntermediate, yOpen } = metrics;
  if (translateY >= yClosed - 0.5) {
    return { phaseA: 0, phaseB: 0 };
  }
  if (translateY <= yOpen + 0.5) {
    return { phaseA: 1, phaseB: 1 };
  }
  if (translateY > yIntermediate) {
    const span = Math.max(yClosed - yIntermediate, 1);
    const phaseA = 1 - (translateY - yIntermediate) / span;
    return { phaseA: Math.min(1, Math.max(0, phaseA)), phaseB: 0 };
  }
  const span = Math.max(yIntermediate - yOpen, 1);
  const phaseB = 1 - translateY / span;
  return { phaseA: 1, phaseB: Math.min(1, Math.max(0, phaseB)) };
}

export function conversationSheetSnapFromTranslate(
  translateY: number,
  metrics: ConversationSheetMetrics,
): ConversationSheetSnap {
  const { phaseA, phaseB } = conversationSheetMotionFromTranslate(translateY, metrics);
  if (phaseB > 0.65) {
    return "full";
  }
  if (phaseA < 0.35 && phaseB < 0.12) {
    return "peek";
  }
  if (phaseB < 0.88) {
    return "reply";
  }
  return "full";
}

/** @deprecated Height-based phases — use translate detents; kept for chrome hysteresis helpers. */
export function conversationSheetMotionFromHeight(
  heightPx: number,
  peekH: number,
  replyH: number,
  fullH: number,
): ConversationSheetMotion {
  const composerH = Math.max(48, replyH - peekH);
  const metrics = conversationSheetMetrics(peekH, replyH, fullH, composerH);
  const y = Math.max(0, metrics.openH - heightPx);
  return conversationSheetMotionFromTranslate(y, metrics);
}

export function conversationSheetSnapFromHeight(
  heightPx: number,
  peekH: number,
  replyH: number,
  fullH: number,
): ConversationSheetSnap {
  const composerH = Math.max(48, replyH - peekH);
  const metrics = conversationSheetMetrics(peekH, replyH, fullH, composerH);
  const y = Math.max(0, metrics.openH - heightPx);
  return conversationSheetSnapFromTranslate(y, metrics);
}

export function chromeSnapForHeight(
  height: number,
  peekH: number,
  replyH: number,
  fullH: number,
  opts?: { collapsing?: boolean; expanding?: boolean },
): ConversationSheetSnap {
  const composerH = Math.max(48, replyH - peekH);
  const metrics = conversationSheetMetrics(peekH, replyH, fullH, composerH);
  const y = Math.max(0, metrics.openH - height);
  const peekBand = metrics.yClosed - PEEK_LAYOUT_BAND_PX;
  const midClosedIntermediate = (metrics.yClosed + metrics.yIntermediate) / 2;
  const midIntermediateOpen = (metrics.yIntermediate + metrics.yOpen) / 2;
  if (y >= peekBand) {
    return "peek";
  }
  if (opts?.collapsing) {
    if (y > midIntermediateOpen) {
      return "reply";
    }
    return "full";
  }
  if (opts?.expanding) {
    if (y > midClosedIntermediate) {
      return "peek";
    }
    if (y > midIntermediateOpen) {
      return "reply";
    }
    return "full";
  }
  if (y > midClosedIntermediate) {
    return "peek";
  }
  if (y > midIntermediateOpen) {
    return "reply";
  }
  return "full";
}

export function conversationSheetDragTranslate({
  from,
  startY,
  dy,
  metrics,
}: {
  from: ConversationSheetSnap;
  startY: number;
  dy: number;
  metrics: ConversationSheetMetrics;
}): number {
  const raw = Math.max(metrics.yOpen, Math.min(metrics.yClosed, startY + dy));
  if (from !== "peek") {
    return raw;
  }
  return Math.max(metrics.yIntermediate, Math.min(metrics.yClosed, raw));
}

/** Map drag translate to legacy visible-height for tests. */
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
  const composerH = Math.max(48, replyH - peekH);
  const metrics = conversationSheetMetrics(peekH, replyH, fullH, composerH);
  const startY = Math.max(0, metrics.openH - startH);
  const y = conversationSheetDragTranslate({
    from,
    startY,
    dy,
    metrics,
  });
  const bottom = conversationSheetClipBottomForTop(y, metrics);
  return conversationSheetVisibleHeight(y, metrics, bottom);
}
