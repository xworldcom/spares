"use client";

import { useRef, type ReactNode } from "react";
import { useDesktopStage } from "@/components/machine/useDesktopStage";
import { useSnapSheet } from "@/lib/hooks/useSnapSheet";

export function ConversationSheet({
  title,
  peekLine: _peekLine,
  unread: _unread,
  children,
  layout = "overlay",
  open = true,
  onOpenChange,
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
}) {
  const desktop = useDesktopStage();
  const card = useRef<HTMLElement>(null);
  const {
    sheet,
    dragging,
    hide,
    expand,
    collapseToPeek,
    toggleHandle,
    dragMoved,
    pointerHandlers,
  } = useSnapSheet({
    cardRef: card,
    open,
    onOpenChange,
    desktopStage: desktop,
    scrollBodySelector: ".imsg-thread",
  });

  const overlayMobile = layout === "overlay" && !desktop;
  const showChrome = overlayMobile && sheet !== "peek" && sheet !== "out";
  const expanded =
    sheet === "full" || sheet === "reply" || (layout === "inline" && desktop);

  return (
    <aside
      ref={card}
      data-conversation-sheet=""
      data-layout={layout}
      data-snap={sheet}
      className={[
        "conversation-sheet",
        "snap-sheet",
        sheet === "full" ? "is-full" : "",
        sheet === "reply" ? "is-reply" : "",
        sheet === "peek" ? "is-peek" : "",
        sheet === "out" ? "is-out" : "",
        dragging ? "is-dragging" : "",
        layout === "inline" ? "is-inline" : "",
        expanded ? "is-expanded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...(overlayMobile ? pointerHandlers : {})}
    >
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
      <div className="conversation-sheet-body min-h-0 flex flex-1 flex-col">
        {showChrome ? (
          <div className="conversation-sheet-grab snap-sheet-grab flex shrink-0 items-center justify-between gap-3 px-4 pb-1 pt-0.5">
            <p className="text-[17px] font-semibold tracking-tight">{title}</p>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full spares-muted"
              aria-label="Collapse conversation"
              onClick={() => {
                if (desktop && layout === "overlay") {
                  collapseToPeek();
                  return;
                }
                hide();
              }}
            >
              <span className="text-2xl leading-none">×</span>
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </aside>
  );
}
