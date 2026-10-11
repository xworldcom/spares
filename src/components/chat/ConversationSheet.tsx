"use client";

import { useRef, type ReactNode } from "react";
import { useDesktopStage } from "@/components/machine/useDesktopStage";
import {
  ConversationSheetProvider,
} from "@/components/chat/ConversationSheetContext";
import { ConversationSheetDebugHud } from "@/components/chat/ConversationSheetDebugHud";
import { useSnapSheet } from "@/lib/hooks/useSnapSheet";

export function ConversationSheet({
  title,
  peekLine: _peekLine,
  unread,
  children,
  layout = "overlay",
  open = true,
  onOpenChange,
  threadKey,
}: {
  title: string;
  /** Kept for call-site compatibility; latest context now comes from the live thread. */
  peekLine: string;
  unread?: boolean;
  children: ReactNode;
  /** Fixed viewport sheet (mobile / quote page) vs flex column in a split pane. */
  layout?: "overlay" | "inline";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Resets snap when switching tickets/quotes. */
  threadKey?: string;
}) {
  const desktop = useDesktopStage();
  const card = useRef<HTMLElement>(null);
  const {
    sheet,
    displaySnap,
    motionPhaseA,
    motionPhaseB,
    settling,
    dragging,
    expand,
    toggleHandle,
    dragMoved,
    collapseToPeek,
    closeViaTranslate,
    pointerHandlers,
    threadDocked,
    threadScrollLocked,
  } = useSnapSheet({
    cardRef: card,
    open,
    onOpenChange,
    desktopStage: desktop,
    scrollBodySelector: ".imsg-thread",
    openForUnread: Boolean(unread) && layout === "overlay",
    inlineLayout: layout === "inline",
    resetKey: threadKey,
  });

  const overlayMobile = layout === "overlay" && !desktop;
  /** Snap classes follow resting `sheet` — motion phases paint inline during drag/settle. */
  const stageSnap = sheet;
  const expanded =
    sheet === "full" ||
    sheet === "reply" ||
    (overlayMobile && sheet === "out") ||
    displaySnap === "full" ||
    displaySnap === "reply" ||
    (layout === "inline" && desktop);
  const showToolbar =
    overlayMobile &&
    (sheet === "reply" || sheet === "full" || sheet === "peek" || sheet === "out");
  const showCloseButton =
    overlayMobile && sheet !== "out" && (sheet === "reply" || sheet === "full" || sheet === "peek");

  return (
    <aside
      ref={card}
      data-conversation-sheet=""
      data-layout={layout}
      data-snap={displaySnap}
      className={[
        "conversation-sheet",
        "snap-sheet",
        stageSnap === "full" ? "is-full" : "",
        stageSnap === "reply" || (overlayMobile && stageSnap === "out") ? "is-reply" : "",
        stageSnap === "peek" ? "is-peek" : "",
        stageSnap === "out" ? "is-out" : "",
        dragging ? "is-dragging" : "",
        settling ? "is-settling" : "",
        layout === "inline" ? "is-inline" : "",
        expanded ? "is-expanded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...(overlayMobile ? pointerHandlers : {})}
    >
      {overlayMobile ? (
        <ConversationSheetDebugHud
          cardRef={card}
          sheet={sheet}
          displaySnap={displaySnap}
          dragging={dragging}
          motionPhaseA={motionPhaseA}
          motionPhaseB={motionPhaseB}
        />
      ) : null}
      <button
        type="button"
        className="snap-sheet-handle quote-sheet-handle"
        aria-label={
          sheet === "full"
            ? "Collapse conversation"
            : sheet === "reply"
              ? "Show more history"
              : "Open conversation"
        }
        onClick={() => {
          if (dragMoved()) {
            return;
          }
          if (sheet === "peek") {
            expand();
            return;
          }
          toggleHandle();
        }}
      />
      {showToolbar ? (
        <div className="conversation-sheet-toolbar">
          <p className="conversation-sheet-toolbar-title">
            {title}
            {unread ? (
              <span className="conversation-sheet-unread-dot" aria-label="Unread messages" />
            ) : null}
          </p>
          {showCloseButton ? (
            <button
              type="button"
              className="conversation-sheet-close"
              onClick={(event) => {
                event.stopPropagation();
                closeViaTranslate();
              }}
            >
              Close
            </button>
          ) : null}
        </div>
      ) : null}
      <ConversationSheetProvider
        value={{
          snap: sheet,
          dragging,
          threadDocked,
          threadScrollLocked,
          inline: layout === "inline",
          collapse: collapseToPeek,
        }}
      >
        <div className="conversation-sheet-body min-h-0 flex flex-1 flex-col">
          {children}
        </div>
      </ConversationSheetProvider>
    </aside>
  );
}
