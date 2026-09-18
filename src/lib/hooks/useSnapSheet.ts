"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  initialConversationSheetSnap,
  type ConversationSheetSnap,
} from "@/lib/ui/conversation-sheet";

const DRAG_SLOP = 8;
const SAMPLE_WINDOW_MS = 90;

export type SnapSheetSnap = ConversationSheetSnap;

const STAGE_ORDER: ConversationSheetSnap[] = ["peek", "reply", "full"];

function remPx(rem: number) {
  if (typeof window === "undefined") {
    return rem * 16;
  }
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return rem * (Number.isFinite(root) && root > 0 ? root : 16);
}

function tabBarPx() {
  if (typeof window === "undefined") {
    return 56;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--spares-tabbar")
    .trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 56;
}

function heightForSnap(snap: ConversationSheetSnap) {
  if (snap === "out") {
    return 0;
  }
  if (snap === "peek") {
    return remPx(5.75);
  }
  if (snap === "reply") {
    return remPx(16.5);
  }
  return Math.min(window.innerHeight * 0.92, window.innerHeight - tabBarPx() - 48);
}

function nearestSnap(height: number, velocity: number): ConversationSheetSnap {
  const peek = heightForSnap("peek");
  const reply = heightForSnap("reply");
  const full = heightForSnap("full");
  // Flick preference
  if (velocity < -0.45) {
    if (height < reply - 24) {
      return "reply";
    }
    return "full";
  }
  if (velocity > 0.45) {
    if (height > reply + 24) {
      return "reply";
    }
    return "peek";
  }
  const midPeekReply = (peek + reply) / 2;
  const midReplyFull = (reply + full) / 2;
  if (height < midPeekReply) {
    return "peek";
  }
  if (height < midReplyFull) {
    return "reply";
  }
  return "full";
}

function stepToward(
  from: ConversationSheetSnap,
  direction: "up" | "down",
): ConversationSheetSnap {
  if (from === "out") {
    return direction === "up" ? "peek" : "out";
  }
  const index = STAGE_ORDER.indexOf(from);
  if (index < 0) {
    return "peek";
  }
  if (direction === "up") {
    return STAGE_ORDER[Math.min(index + 1, STAGE_ORDER.length - 1)]!;
  }
  return STAGE_ORDER[Math.max(index - 1, 0)]!;
}

function isSkipTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(".quote-sheet-handle, .quote-sheet-grab, .snap-sheet-handle, .snap-sheet-grab")) {
    return false;
  }
  return Boolean(target.closest("button, a, input, textarea, select, label"));
}

export function useSnapSheet({
  cardRef,
  open,
  onOpenChange,
  desktopStage,
  scrollBodySelector,
}: {
  cardRef: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  desktopStage: boolean;
  /** Scrollable thread; drag-to-collapse from full waits until scrollTop is 0. */
  scrollBodySelector: string;
}) {
  const [sheet, setSheet] = useState<SnapSheetSnap>(() =>
    initialConversationSheetSnap(open, desktopStage),
  );
  const [dragging, setDragging] = useState(false);
  const drag = useRef({
    y: 0,
    on: false,
    pending: false,
    from: "peek" as SnapSheetSnap,
    startH: 0,
    moved: false,
    samples: [] as { t: number; y: number }[],
  });

  function setOpen(next: boolean) {
    onOpenChange?.(next);
  }

  function paintHeight(px: number) {
    const full = heightForSnap("full");
    const peek = heightForSnap("peek");
    const clamped = Math.max(peek, Math.min(full, px));
    cardRef.current?.style.setProperty("--sheet-h", `${clamped}px`);
    cardRef.current?.style.setProperty("--drag-h", "0px");
  }

  function clearInlineHeight() {
    cardRef.current?.style.removeProperty("--sheet-h");
    cardRef.current?.style.removeProperty("--drag-h");
  }

  function setDraggingClass(on: boolean) {
    cardRef.current?.classList.toggle("is-dragging", on);
  }

  function stickThreadToLatest() {
    const body = cardRef.current?.querySelector(scrollBodySelector);
    if (body instanceof HTMLElement) {
      body.scrollTop = body.scrollHeight;
    }
  }

  useEffect(() => {
    if (open) {
      setSheet((current) => {
        if (current !== "out") {
          return current;
        }
        return initialConversationSheetSnap(true, desktopStage);
      });
      clearInlineHeight();
      setDragging(false);
      setDraggingClass(false);
      return;
    }
    setSheet("out");
    clearInlineHeight();
    setDragging(false);
    setDraggingClass(false);
  }, [open, desktopStage, cardRef]);

  useEffect(() => {
    if (dragging || sheet === "out") {
      return;
    }
    // After a snap settles, keep the latest message pinned in view.
    const id = window.requestAnimationFrame(() => stickThreadToLatest());
    return () => window.cancelAnimationFrame(id);
  }, [sheet, dragging]);

  function dismiss() {
    setSheet("out");
    clearInlineHeight();
    setDragging(false);
    setDraggingClass(false);
    setOpen(false);
  }

  function hide() {
    if (desktopStage) {
      dismiss();
      return;
    }
    if (sheet === "full") {
      setSheet("reply");
      setOpen(true);
      return;
    }
    if (sheet === "reply") {
      setSheet("peek");
      setOpen(true);
      return;
    }
    dismiss();
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    from: SnapSheetSnap,
    pending: boolean,
  ) {
    const startH =
      cardRef.current?.getBoundingClientRect().height ?? heightForSnap(from);
    drag.current = {
      y: event.clientY,
      on: !pending,
      pending,
      from,
      startH,
      moved: false,
      samples: [{ t: performance.now(), y: event.clientY }],
    };
    if (!pending) {
      setDragging(true);
      setDraggingClass(true);
      paintHeight(startH);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function onCardPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (desktopStage) {
      return;
    }
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }
    if (isSkipTarget(event.target)) {
      return;
    }
    const fromHandle = !!(event.target as HTMLElement).closest(
      ".quote-sheet-handle, .quote-sheet-grab, .snap-sheet-handle, .snap-sheet-grab",
    );
    if (sheet === "full" && !fromHandle) {
      beginDrag(event, "full", true);
      return;
    }
    if (sheet === "reply" && !fromHandle) {
      // Reply thread may scroll once it has a few lines; prefer handle/composer chrome for drag.
      const body = cardRef.current?.querySelector(scrollBodySelector);
      const atBottom =
        body instanceof HTMLElement
          ? body.scrollHeight - body.scrollTop - body.clientHeight <= 2
          : true;
      const atTop = body instanceof HTMLElement ? body.scrollTop <= 1 : true;
      if (!atTop && !atBottom) {
        return;
      }
    }
    // Peek / handle: pending until slop so a tap still steps open.
    beginDrag(event, sheet === "out" ? "peek" : sheet, sheet === "peek" || !fromHandle);
  }

  function recordSample(y: number) {
    const now = performance.now();
    const samples = drag.current.samples;
    samples.push({ t: now, y });
    while (samples.length > 1 && now - samples[0].t > SAMPLE_WINDOW_MS) {
      samples.shift();
    }
  }

  function liveVelocity() {
    const samples = drag.current.samples;
    if (samples.length < 2) {
      return 0;
    }
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    const dt = Math.max(last.t - first.t, 1);
    return (last.y - first.y) / dt;
  }

  function activateDrag(event: ReactPointerEvent<HTMLElement>) {
    drag.current.on = true;
    drag.current.pending = false;
    drag.current.moved = true;
    setDragging(true);
    setDraggingClass(true);
    paintHeight(drag.current.startH);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCardPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending) {
      const dy = event.clientY - drag.current.y;
      const from = drag.current.from;
      if (from === "peek" || from === "reply") {
        if (Math.abs(dy) > DRAG_SLOP) {
          activateDrag(event);
        } else {
          return;
        }
      } else if (from === "full") {
        const body = cardRef.current?.querySelector(scrollBodySelector);
        const atTop = body instanceof HTMLElement ? body.scrollTop <= 1 : true;
        if (dy > DRAG_SLOP && atTop) {
          activateDrag(event);
        } else if (Math.abs(dy) > DRAG_SLOP) {
          drag.current.pending = false;
          return;
        } else {
          return;
        }
      }
    }
    if (!drag.current.on) {
      return;
    }
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dy) > DRAG_SLOP) {
      drag.current.moved = true;
    }
    // Pull up (negative dy) grows the sheet; pull down shrinks it.
    recordSample(event.clientY);
    paintHeight(drag.current.startH - dy);
    stickThreadToLatest();
  }

  function settleTo(next: ConversationSheetSnap) {
    drag.current.on = false;
    drag.current.pending = false;
    setDragging(false);
    setDraggingClass(false);
    clearInlineHeight();
    setSheet(next);
    setOpen(true);
  }

  function settleSheet(dy: number, from: SnapSheetSnap) {
    const velocity = liveVelocity();
    const currentH = drag.current.startH - dy;
    if (Math.abs(dy) < 28 && Math.abs(velocity) < 0.3) {
      // Small nudge — step one stage in the gesture direction.
      if (dy < -12 || velocity < -0.2) {
        settleTo(stepToward(from === "out" ? "peek" : from, "up"));
        return;
      }
      if (dy > 12 || velocity > 0.2) {
        settleTo(stepToward(from === "out" ? "peek" : from, "down"));
        return;
      }
      settleTo(from === "out" ? "peek" : from);
      return;
    }
    settleTo(nearestSnap(currentH, velocity));
  }

  function onCardPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending) {
      const from = drag.current.from;
      drag.current.pending = false;
      drag.current.on = false;
      // Tap: open one stage (peek → reply → full).
      if (from === "peek" || from === "reply") {
        settleTo(stepToward(from, "up"));
      }
      return;
    }
    if (!drag.current.on) {
      return;
    }
    const dy = event.clientY - drag.current.y;
    recordSample(event.clientY);
    if (!drag.current.moved && Math.abs(dy) < DRAG_SLOP) {
      const from = drag.current.from;
      drag.current.on = false;
      setDragging(false);
      setDraggingClass(false);
      clearInlineHeight();
      if (from === "peek" || from === "reply") {
        settleTo(stepToward(from, "up"));
      }
      return;
    }
    settleSheet(dy, drag.current.from);
  }

  function toggleHandle() {
    if (drag.current.moved) {
      return;
    }
    if (desktopStage) {
      hide();
      return;
    }
    if (sheet === "full") {
      setSheet("reply");
    } else if (sheet === "reply") {
      setSheet("peek");
    } else {
      setSheet("reply");
      setOpen(true);
    }
  }

  function expand() {
    setSheet(sheet === "peek" ? "reply" : "full");
    setOpen(true);
  }

  function collapseToPeek() {
    setSheet("peek");
    setOpen(true);
  }

  return {
    sheet,
    dragging,
    setSheet,
    dismiss,
    hide,
    expand,
    collapseToPeek,
    toggleHandle,
    dragMoved: () => drag.current.moved,
    pointerHandlers: {
      onPointerDown: onCardPointerDown,
      onPointerMove: onCardPointerMove,
      onPointerUp: onCardPointerUp,
      onPointerCancel: onCardPointerUp,
    },
  };
}
