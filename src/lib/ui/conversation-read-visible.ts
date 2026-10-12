import type { ConversationSheetSnap } from "./conversation-sheet.ts";

/** True when the conversation body is meaningfully on screen (not collapsed peek/out). */
export function conversationReadVisible(
  snap: ConversationSheetSnap | undefined,
  layout: "overlay" | "inline",
  conversationDock: boolean,
) {
  if (layout === "inline" && conversationDock) {
    return true;
  }
  if (!snap || snap === "out" || snap === "peek") {
    return false;
  }
  return snap === "full" || snap === "reply";
}
