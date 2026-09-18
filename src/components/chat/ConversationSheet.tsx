"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useDesktopStage } from "@/components/machine/useDesktopStage";
import { useSnapSheet } from "@/lib/hooks/useSnapSheet";
import { conversationSheetMetrics } from "@/lib/ui/conversation-sheet";

function pinThreadToEnd(root: HTMLElement | null) {
  const thread = root?.querySelector(".imsg-thread");
  if (!(thread instanceof HTMLElement)) {
    return;
  }
  thread.scrollTop = thread.scrollHeight;
}

function measureSheet(root: HTMLElement) {
  const handle = root.querySelector(".snap-sheet-handle");
  const composer = root.querySelector(".imsg-composer");
  const last = root.querySelector(".imsg-thread > li:last-child");
  const handleH = handle instanceof HTMLElement ? handle.getBoundingClientRect().height + 8 : 28;
  const composerH = composer instanceof HTMLElement ? composer.getBoundingClientRect().height : 72;
  const lastH = last instanceof HTMLElement ? last.getBoundingClientRect().height : 96;
  const next = conversationSheetMetrics({
    handleH,
    threadPeekH: Math.max(72, Math.min(168, lastH + 10)),
    composerH,
    viewportH: window.innerHeight,
  });
  root.style.setProperty("--peek-thread-h", `${next.threadPeekH}px`);
  root.style.setProperty("--peek-h", `${next.peekH}px`);
  root.style.setProperty("--compose-h", `${next.composeH}px`);
  root.style.setProperty("--full-h", `${next.fullH}px`);
}

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
  const showPeekBand = layout === "overlay" && desktop && sheet === "peek";
  const showGrab = layout === "overlay" && !desktop && sheet === "full";

  useLayoutEffect(() => {
    const root = card.current;
    if (!root || desktop || layout !== "overlay") {
      return;
    }
    measureSheet(root);
    pinThreadToEnd(root);
  }, [desktop, layout, peekLine, children, sheet]);

  useLayoutEffect(() => {
    const root = card.current;
    if (!root || desktop || layout !== "overlay") {
      return;
    }
    const thread = root.querySelector(".imsg-thread");
    if (!(thread instanceof HTMLElement)) {
      return;
    }
    const keepPinned = () => {
      pinThreadToEnd(root);
    };
    keepPinned();
    const observer = new ResizeObserver(() => {
      if (sheet === "full") {
        const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 96;
        if (nearBottom) {
          thread.scrollTop = thread.scrollHeight;
        }
        return;
      }
      keepPinned();
    });
    observer.observe(thread);
    observer.observe(root);
    const composer = root.querySelector(".imsg-composer");
    if (composer instanceof HTMLElement) {
      observer.observe(composer);
    }
    return () => observer.disconnect();
  }, [desktop, layout, sheet]);

  return (
    <aside
      ref={card}
      data-conversation-sheet=""
      data-layout={layout}
      data-sheet={sheet}
      className={[
        "conversation-sheet",
        "snap-sheet",
        sheet === "full" ? "is-full" : "",
        sheet === "compose" ? "is-compose" : "",
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
      <div className="conversation-sheet-body min-h-0 flex flex-1 flex-col">
        {showGrab ? (
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
