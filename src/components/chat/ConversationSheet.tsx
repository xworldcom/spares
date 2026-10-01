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
    dragging,
    expand,
    toggleHandle,
    dragMoved,
    collapseToPeek,
    pointerHandlers,
  } = useSnapSheet({
    cardRef: card,
    open,
    onOpenChange,
    desktopStage: desktop,
    scrollBodySelector: ".imsg-thread",
    openForUnread: Boolean(unread) && layout === "overlay" && !desktop,
    resetKey: threadKey,
  });

  const overlayMobile = layout === "overlay" && !desktop;
  /** Painted layout follows `displaySnap` (drag + animated collapse hold reply/full chrome). */
  const stageSnap = displaySnap;
  const expanded =
    displaySnap === "full" ||
    displaySnap === "reply" ||
    (layout === "inline" && desktop);
  const showChrome = overlayMobile && displaySnap !== "out";

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
        stageSnap === "reply" ? "is-reply" : "",
        stageSnap === "peek" ? "is-peek" : "",
        stageSnap === "out" ? "is-out" : "",
        dragging ? "is-dragging" : "",
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
      {showChrome ? (
        <div className="conversation-sheet-toolbar">
          <p className="conversation-sheet-toolbar-title">
            {title}
            {unread ? (
              <span className="conversation-sheet-unread-dot" aria-label="Unread messages" />
            ) : null}
          </p>
          <button
            type="button"
            className="conversation-sheet-close"
            onClick={(event) => {
              event.stopPropagation();
              collapseToPeek();
            }}
          >
            Close
          </button>
        </div>
      ) : null}
      <ConversationSheetProvider
        value={{
          snap: sheet,
          dragging,
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
