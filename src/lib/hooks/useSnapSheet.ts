"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  initialQuoteSheetSnap,
  type QuoteSheetSnap,
} from "@/lib/ui/quote-sheet";

const DRAG_SLOP = 8;
const SAMPLE_WINDOW_MS = 90;

export type SnapSheetSnap = QuoteSheetSnap;

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
  /** Scrollable region inside full sheet; drag-to-collapse waits until scrollTop is 0. */
  scrollBodySelector: string;
}) {
  const [sheet, setSheet] = useState<SnapSheetSnap>(() =>
    initialQuoteSheetSnap(open, desktopStage),
  );
  const [dragging, setDragging] = useState(false);
  const drag = useRef({
    y: 0,
    on: false,
    pending: false,
    from: "peek" as SnapSheetSnap,
    moved: false,
    samples: [] as { t: number; y: number }[],
  });

  function setOpen(next: boolean) {
    onOpenChange?.(next);
  }

  function paintDrag(px: number) {
    cardRef.current?.style.setProperty("--drag", `${px}px`);
  }

  function setDraggingClass(on: boolean) {
    cardRef.current?.classList.toggle("is-dragging", on);
  }

  useEffect(() => {
    if (open) {
      setSheet((current) => {
        if (current !== "out") {
          return current;
        }
        return initialQuoteSheetSnap(true, desktopStage);
      });
      paintDrag(0);
      setDragging(false);
      setDraggingClass(false);
      return;
    }
    setSheet("out");
    paintDrag(0);
    setDragging(false);
    setDraggingClass(false);
  }, [open, desktopStage, cardRef]);

  function dismiss() {
    setSheet("out");
    paintDrag(0);
    setDragging(false);
    setDraggingClass(false);
    setOpen(false);
  }

  function hide() {
    if (sheet === "full" && !desktopStage) {
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
    drag.current = {
      y: event.clientY,
      on: !pending,
      pending,
      from,
      moved: false,
      samples: [{ t: performance.now(), y: event.clientY }],
    };
    if (!pending) {
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
    // Peek stays pending until an upward drag clears slop so a tap expands
    // (immediate capture ate clicks on iOS / the grab handle).
    beginDrag(event, sheet === "full" ? "full" : "peek", sheet !== "full");
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
    if (drag.current.pending) {
      const dy = event.clientY - drag.current.y;
      if (drag.current.from === "peek") {
        if (dy < -DRAG_SLOP) {
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
      } else if (drag.current.from === "full") {
        const body = cardRef.current?.querySelector(scrollBodySelector);
        const atTop = body instanceof HTMLElement ? body.scrollTop <= 1 : true;
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
    setDragging(false);
    setDraggingClass(false);
    paintDrag(0);
    const velocity = liveVelocity();
    if (from === "full") {
      if (dy > 48 || velocity > 0.35) {
        setSheet("peek");
        setOpen(true);
      } else {
        setSheet("full");
      }
      return;
    }
    if (dy < -36 || velocity < -0.35) {
      setSheet("full");
      setOpen(true);
      return;
    }
    setSheet("peek");
    setOpen(true);
  }

  function onCardPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending) {
      const from = drag.current.from;
      drag.current.pending = false;
      drag.current.on = false;
      // Tap on peek / handle: expand without requiring a drag.
      if (from === "peek") {
        setSheet("full");
        setOpen(true);
      }
      return;
    }
    if (!drag.current.on) {
      return;
    }
    const dy = event.clientY - drag.current.y;
    recordSample(event.clientY);
    if (!drag.current.moved && Math.abs(dy) < DRAG_SLOP) {
      drag.current.on = false;
      setDragging(false);
      setDraggingClass(false);
      paintDrag(0);
      if (drag.current.from !== "full") {
        setSheet("full");
        setOpen(true);
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
      setSheet("peek");
    } else {
      setSheet("full");
      setOpen(true);
    }
  }

  function expand() {
    setSheet("full");
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
