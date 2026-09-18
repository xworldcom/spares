"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  conversationSheetDragHeight,
  conversationSheetSnapHeight,
  conversationSheetStep,
  settleConversationSheet,
  type ConversationSheetSnap,
} from "@/lib/ui/conversation-sheet";
import { initialQuoteSheetSnap } from "@/lib/ui/quote-sheet";

const DRAG_SLOP = 8;
const SAMPLE_WINDOW_MS = 90;

export type SnapSheetSnap = ConversationSheetSnap;

function isSkipTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(".quote-sheet-handle, .quote-sheet-grab, .snap-sheet-handle, .snap-sheet-grab")) {
    return false;
  }
  return Boolean(target.closest("button, a, input, textarea, select, label"));
}

function readPx(style: CSSStyleDeclaration | null, name: string, fallback: number) {
  const raw = style?.getPropertyValue(name)?.trim() ?? "";
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (raw.endsWith("rem")) {
    return value * 16;
  }
  return value;
}

function readSheetHeights(card: HTMLElement | null) {
  const style = card ? getComputedStyle(card) : null;
  const peekH = readPx(style, "--peek-h", 140);
  const composeH = readPx(style, "--compose-h", 220);
  const fullH = readPx(style, "--full-h", 640);
  const live = card?.getBoundingClientRect().height ?? peekH;
  return { peekH, composeH, fullH, live };
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
  /** Scrollable region inside full sheet; drag-to-collapse waits until scrollTop is 0. */
  scrollBodySelector: string;
}) {
  const [sheet, setSheet] = useState<SnapSheetSnap>(() =>
    initialQuoteSheetSnap(open, desktopStage),
  );
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const drag = useRef({
    y: 0,
    on: false,
    pending: false,
    from: "peek" as SnapSheetSnap,
    moved: false,
    samples: [] as { t: number; y: number }[],
  });
  const settleFrame = useRef(0);

  function setOpen(next: boolean) {
    onOpenChange?.(next);
  }

  function applyHeight(px: number | null, animate: boolean) {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    if (px == null) {
      card.style.removeProperty("height");
      card.style.removeProperty("transition");
      card.style.removeProperty("--live-h");
      return;
    }
    const next = `${Math.round(px)}px`;
    card.style.transition = animate ? "height 0.52s var(--sheet-ease)" : "none";
    card.style.height = next;
    card.style.setProperty("--live-h", next);
  }

  function paintDrag(px: number) {
    const { peekH, composeH, fullH } = readSheetHeights(cardRef.current);
    const live = conversationSheetDragHeight({
      from: drag.current.from,
      dy: px,
      peekH,
      composeH,
      fullH,
    });
    applyHeight(live, false);
  }

  function setDraggingClass(on: boolean) {
    cardRef.current?.classList.toggle("is-dragging", on);
  }

  function finishSettle(next: SnapSheetSnap) {
    const card = cardRef.current;
    window.cancelAnimationFrame(settleFrame.current);
    if (desktopStage) {
      applyHeight(null, false);
      setSheet(next);
      setOpen(true);
      setDragging(false);
      setDraggingClass(false);
      return;
    }
    const { peekH, composeH, fullH, live } = readSheetHeights(card);
    const target = conversationSheetSnapHeight(next, peekH, composeH, fullH);
    applyHeight(live, false);
    setSheet(next);
    setOpen(true);
    if (Math.abs(live - target) < 2) {
      applyHeight(null, false);
      setDragging(false);
      setDraggingClass(false);
      return;
    }
    let done = false;
    const end = (event?: Event) => {
      if (done || (event && event.target !== card)) {
        return;
      }
      done = true;
      card?.removeEventListener("transitionend", end);
      applyHeight(null, false);
      setDragging(false);
      setDraggingClass(false);
    };
    settleFrame.current = window.requestAnimationFrame(() => {
      applyHeight(target, true);
      card?.addEventListener("transitionend", end);
      window.setTimeout(() => end(), 640);
    });
  }

  useEffect(() => {
    return () => window.cancelAnimationFrame(settleFrame.current);
  }, []);

  useEffect(() => {
    if (open) {
      setSheet((current) => {
        if (current !== "out") {
          return current;
        }
        return initialQuoteSheetSnap(true, desktopStage);
      });
      applyHeight(null, false);
      setDragging(false);
      setDraggingClass(false);
      return;
    }
    setSheet("out");
      applyHeight(null, false);
    setDragging(false);
    setDraggingClass(false);
  }, [open, desktopStage, cardRef]);

  function dismiss() {
    setSheet("out");
      applyHeight(null, false);
    setDragging(false);
    setDraggingClass(false);
    setOpen(false);
  }

  function hide() {
    if (sheet !== "out" && !desktopStage) {
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
    window.cancelAnimationFrame(settleFrame.current);
    drag.current = {
      y: event.clientY,
      on: !pending,
      pending,
      from,
      moved: false,
      samples: [{ t: performance.now(), y: event.clientY }],
    };
    if (!pending) {
      const { live } = readSheetHeights(cardRef.current);
      applyHeight(live, false);
      setDragging(true);
      setDraggingClass(true);
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
    beginDrag(event, sheet === "out" ? "peek" : sheet, false);
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
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = Math.max(last.t - first.t, 1);
    return (last.y - first.y) / dt;
  }

  function onCardPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending && drag.current.from === "full") {
      const dy = event.clientY - drag.current.y;
      const body = cardRef.current?.querySelector(scrollBodySelector);
      const thread = cardRef.current?.querySelector(".imsg-thread");
      const scroller = thread instanceof HTMLElement ? thread : body;
      const atTop = scroller instanceof HTMLElement ? scroller.scrollTop <= 1 : true;
      if (dy > DRAG_SLOP && atTop) {
        drag.current.on = true;
        drag.current.pending = false;
        drag.current.moved = true;
        setDragging(true);
        setDraggingClass(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (Math.abs(dy) > DRAG_SLOP) {
        drag.current.pending = false;
        return;
      } else {
        return;
      }
    }
    if (!drag.current.on) {
      return;
    }
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dy) > DRAG_SLOP) {
      drag.current.moved = true;
    }
    const from = drag.current.from;
    const next =
      (from === "full" && dy < 0) || (from === "peek" && dy > 0)
        ? dy * 0.18
        : dy;
    recordSample(event.clientY);
    paintDrag(next);
  }

  function settleSheet(dy: number, from: SnapSheetSnap) {
    drag.current.on = false;
    drag.current.pending = false;
    const { peekH, composeH, fullH, live } = readSheetHeights(cardRef.current);
    const next = settleConversationSheet({
      from,
      dy,
      velocity: liveVelocity(),
      height: live,
      peekH,
      composeH,
      fullH,
    });
    finishSettle(next);
  }

  function onCardPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending) {
      drag.current.pending = false;
      drag.current.on = false;
      return;
    }
    if (!drag.current.on) {
      return;
    }
    const dy = event.clientY - drag.current.y;
    recordSample(event.clientY);
    if (!drag.current.moved && Math.abs(dy) < DRAG_SLOP) {
      drag.current.on = false;
      if (drag.current.from !== "full") {
        finishSettle(conversationSheetStep(drag.current.from, "up"));
      } else {
        applyHeight(null, false);
        setDragging(false);
        setDraggingClass(false);
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
    const next = sheet === "full" ? "compose" : conversationSheetStep(sheet, "up");
    finishSettle(next);
  }

  function expand() {
    if (desktopStage) {
      finishSettle("full");
      return;
    }
    finishSettle(conversationSheetStep(sheet === "out" ? "peek" : sheet, "up"));
  }

  function collapseToPeek() {
    finishSettle("peek");
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
