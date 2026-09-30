/** Enable live sheet state HUD via `?sheetDebug=1` or localStorage `sparesSheetDebug=1`. */
export function conversationSheetDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sheetDebug") === "1") {
      return true;
    }
    return window.localStorage.getItem("sparesSheetDebug") === "1";
  } catch {
    return false;
  }
}

export type ConversationSheetDebugSnapshot = {
  sheet: string;
  displaySnap: string;
  dragging: boolean;
  dragComposerOpen: boolean;
  paintedH: number | null;
  boxH: number | null;
  sheetHVar: string;
  layoutPeek: boolean;
  dataSnap: string;
  classSnap: string;
  ts: number;
};

export function readConversationSheetDebugSnapshot(
  card: HTMLElement | null,
  react: {
    sheet: string;
    displaySnap: string;
    dragging: boolean;
    dragComposerOpen: boolean;
  },
): ConversationSheetDebugSnapshot {
  const style = card ? getComputedStyle(card) : null;
  const rawH = card?.style.getPropertyValue("--sheet-h").trim();
  const paintedH = rawH ? Number.parseFloat(rawH) : null;
  return {
    ...react,
    paintedH: Number.isFinite(paintedH) ? paintedH : null,
    boxH: card ? Math.round(card.getBoundingClientRect().height) : null,
    sheetHVar: style?.height ?? "",
    layoutPeek: card?.hasAttribute("data-layout-peek") ?? false,
    dataSnap: card?.getAttribute("data-snap") ?? "",
    classSnap: card
      ? ["is-peek", "is-reply", "is-full", "is-out"]
          .filter((c) => card.classList.contains(c))
          .join(" ")
      : "",
    ts: performance.now(),
  };
}
