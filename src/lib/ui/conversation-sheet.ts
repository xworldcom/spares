import type { QuoteSheetSnap } from "./quote-sheet.ts";

export type ConversationSheetSnap = QuoteSheetSnap;

/** Peek shows the latest bubble; compose adds the typing row; full rolls older messages in. */
export const CONVERSATION_SHEET_STAGES = ["peek", "compose", "full"] as const;

export function conversationSheetStep(
  from: ConversationSheetSnap,
  direction: "up" | "down",
): ConversationSheetSnap {
  if (from === "out") {
    return direction === "up" ? "peek" : "out";
  }
  if (direction === "up") {
    if (from === "peek") {
      return "compose";
    }
    return "full";
  }
  if (from === "full") {
    return "compose";
  }
  if (from === "compose") {
    return "peek";
  }
  return "peek";
}

export function settleConversationSheet({
  from,
  dy,
  velocity,
  height,
  peekH,
  composeH,
  fullH,
}: {
  from: ConversationSheetSnap;
  dy: number;
  velocity: number;
  height: number;
  peekH: number;
  composeH: number;
  fullH: number;
}): Exclude<ConversationSheetSnap, "out"> {
  const start = from === "out" ? "peek" : from;
  const midPeekCompose = (peekH + composeH) / 2;
  const midComposeFull = (composeH + fullH) / 2;
  const flickUp = dy < -36 || velocity < -0.35;
  const flickDown = dy > 48 || velocity > 0.35;
  const farUp = height >= midComposeFull || velocity < -0.55;
  const farDown = height <= midPeekCompose || velocity > 0.55;

  if (start === "peek") {
    if (farUp) {
      return "full";
    }
    if (flickUp || height >= midPeekCompose) {
      return "compose";
    }
    return "peek";
  }

  if (start === "compose") {
    if (flickUp || height >= midComposeFull) {
      return "full";
    }
    if (flickDown || height <= midPeekCompose) {
      return "peek";
    }
    return "compose";
  }

  if (farDown) {
    return "peek";
  }
  if (flickDown || height <= midComposeFull) {
    return "compose";
  }
  return "full";
}

export function conversationSheetMetrics({
  handleH,
  threadPeekH,
  composerH,
  viewportH,
}: {
  handleH: number;
  threadPeekH: number;
  composerH: number;
  viewportH: number;
}) {
  const peekH = Math.max(96, handleH + threadPeekH);
  const composeH = peekH + Math.max(56, composerH);
  const fullH = Math.max(composeH + 80, Math.min(viewportH * 0.92, viewportH - 96));
  return { peekH, composeH, fullH, threadPeekH };
}

export function conversationSheetSnapHeight(
  snap: ConversationSheetSnap,
  peekH: number,
  composeH: number,
  fullH: number,
) {
  if (snap === "full") {
    return fullH;
  }
  if (snap === "compose") {
    return composeH;
  }
  if (snap === "out") {
    return 0;
  }
  return peekH;
}
