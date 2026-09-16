"use client";

import { useRef, type ReactNode } from "react";
import { useDesktopStage } from "@/components/machine/useDesktopStage";
import { useSnapSheet } from "@/lib/hooks/useSnapSheet";

export function ConversationSheet({
  title,
  peekLine,
  unread,
  children,
  layout = "overlay",
  open = true,
  onOpenChange,
}: {
  title: string;
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
    scrollBodySelector: ".conversation-sheet-body",
  });

  const expanded = sheet === "full" || (layout === "inline" && desktop);
  const showPeekBand = layout === "overlay" && sheet === "peek";

  return (
    <aside
      ref={card}
      data-conversation-sheet=""
      data-layout={layout}
      className={[
        "conversation-sheet",
        "snap-sheet",
        sheet === "full" ? "is-full" : "",
        sheet === "peek" ? "is-peek" : "",
        sheet === "out" ? "is-out" : "",
        dragging ? "is-dragging" : "",
        layout === "inline" ? "is-inline" : "",
        expanded ? "is-expanded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...(layout === "overlay" && !desktop ? pointerHandlers : {})}
    >
      <button
        type="button"
        className="snap-sheet-handle quote-sheet-handle"
        aria-label={expanded ? "Collapse conversation" : "Expand conversation"}
        onClick={() => {
          if (dragMoved()) {
            return;
          }
          if (showPeekBand) {
            expand();
            return;
          }
          toggleHandle();
        }}
      />
      {showPeekBand ? (
        <button
          type="button"
          className="conversation-sheet-peek snap-sheet-grab"
          onClick={() => {
            if (dragMoved()) {
              return;
            }
            expand();
          }}
        >
          <span className="conversation-sheet-peek-title">{title}</span>
          <span className="conversation-sheet-peek-line">
            {unread ? <span className="conversation-sheet-unread" aria-hidden="true" /> : null}
            <span className="truncate">{peekLine}</span>
          </span>
        </button>
      ) : null}
      <div
        className="conversation-sheet-body min-h-0 flex flex-1 flex-col"
        aria-hidden={showPeekBand ? true : undefined}
      >
        {layout === "overlay" && !desktop ? (
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
