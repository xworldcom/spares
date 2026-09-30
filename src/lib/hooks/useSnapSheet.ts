"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  REPLY_DETENT_PX,
  PEEK_LAYOUT_BAND_PX,
  chromeSnapForHeight,
  conversationSheetDragHeight,
  dragComposerLift,
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

function headerPx() {
  if (typeof window === "undefined") {
    return 56;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--spares-header")
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
    // Peek thread + composer — history waits for full.
    return remPx(10.25);
  }
  const inset = tabBarPx() + headerPx() + 8;
  return Math.min(window.innerHeight * 0.92, window.innerHeight - inset);
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
  openForUnread,
  resetKey,
}: {
  cardRef: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  desktopStage: boolean;
  /** Scrollable thread; drag-to-collapse from full waits until scrollTop is 0. */
  scrollBodySelector: string;
  /** Mobile overlay: start at reply when the thread has unread messages. */
  openForUnread?: boolean;
  /** When this changes, snap resets for a new thread. */
  resetKey?: string;
}) {
  const [sheet, setSheet] = useState<SnapSheetSnap>(() =>
    initialConversationSheetSnap(open, desktopStage, openForUnread),
  );
  /** While dragging, overrides chrome classes so close→peek matches before release. */
  const [dragChrome, setDragChrome] = useState<ConversationSheetSnap | null>(null);
  const [dragComposerOpen, setDragComposerOpen] = useState(false);
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
  /** Keep the latest message docked while the sheet grows; undock only when the user scrolls history up at full. */
  const dockedRef = useRef(true);
  /** Ignore the synthetic click that follows a pointer step so peek does not skip to full. */
  const steppedAtRef = useRef(0);

  const controlledOpen = typeof onOpenChange === "function";
  const openForUnreadRef = useRef(openForUnread);
  openForUnreadRef.current = openForUnread;

  const displaySnap = dragChrome ?? sheet;

  function setOpen(next: boolean) {
    onOpenChange?.(next);
  }

  function syncLayoutPeek(heightPx: number, forcePeekLayout = false) {
    const peekH = heightForSnap("peek");
    const inPeekBand = heightPx <= peekH + PEEK_LAYOUT_BAND_PX;
    if (inPeekBand || forcePeekLayout) {
      cardRef.current?.setAttribute("data-layout-peek", "");
    } else {
      cardRef.current?.removeAttribute("data-layout-peek");
    }
  }

  function paintHeight(px: number, forcePeekLayout = false) {
    cardRef.current?.style.setProperty("--sheet-h", `${Math.round(px)}px`);
    cardRef.current?.style.setProperty("--drag-h", "0px");
    syncLayoutPeek(px, forcePeekLayout);
  }

  function paintDrag(dy: number) {
    const live = conversationSheetDragHeight({
      from: drag.current.from,
      startH: drag.current.startH,
      dy,
      peekH: heightForSnap("peek"),
      replyH: heightForSnap("reply"),
      fullH: heightForSnap("full"),
    });
    paintHeight(live);
  }

  function clearInlineHeight(atSnap?: ConversationSheetSnap) {
    cardRef.current?.style.removeProperty("--sheet-h");
    cardRef.current?.style.removeProperty("--drag-h");
    const snap = atSnap ?? sheet;
    if (snap === "peek") {
      syncLayoutPeek(heightForSnap("peek"));
    } else {
      cardRef.current?.removeAttribute("data-layout-peek");
    }
  }

  function syncDragChromeFromHeight(height: number, dy: number) {
    const peekH = heightForSnap("peek");
    const replyH = heightForSnap("reply");
    const fullH = heightForSnap("full");
    const nextChrome = chromeSnapForHeight(height, peekH, replyH, fullH, {
      collapsing: dy > 0,
    });
    setDragChrome(nextChrome);
    setDragComposerOpen(dragComposerLift(nextChrome, drag.current.from, dy));
  }

  function clearDragChrome() {
    setDragChrome(null);
    setDragComposerOpen(false);
  }

  function setDraggingClass(on: boolean) {
    cardRef.current?.classList.toggle("is-dragging", on);
  }

  function stickThreadToLatest() {
    if (!dockedRef.current) {
      return;
    }
    const body = cardRef.current?.querySelector(scrollBodySelector);
    if (body instanceof HTMLElement) {
      body.scrollTop = body.scrollHeight;
    }
  }

  useEffect(() => {
    if (!resetKey) {
      return;
    }
    setSheet(
      initialConversationSheetSnap(open, desktopStage, openForUnreadRef.current),
    );
    clearDragChrome();
    dockedRef.current = true;
    clearInlineHeight();
    setDragging(false);
    setDraggingClass(false);
    // Only when switching threads — not when unread clears after mark-read.
  }, [resetKey, open, desktopStage, cardRef]);

  useEffect(() => {
    if (open) {
      setSheet((current) => {
        if (current !== "out") {
          return current;
        }
        return initialConversationSheetSnap(true, desktopStage, openForUnread);
      });
      dockedRef.current = true;
      clearInlineHeight();
      setDragging(false);
      setDraggingClass(false);
      clearDragChrome();
      return;
    }
    if (!controlledOpen && !desktopStage) {
      setSheet("peek");
      clearInlineHeight();
      setDragging(false);
      setDraggingClass(false);
      clearDragChrome();
      return;
    }
    setSheet("out");
    clearInlineHeight();
    setDragging(false);
    setDraggingClass(false);
    clearDragChrome();
  }, [open, desktopStage, cardRef, controlledOpen, openForUnread]);

  useEffect(() => {
    const body = cardRef.current?.querySelector(scrollBodySelector);
    if (!(body instanceof HTMLElement) || sheet === "out") {
      return;
    }
    const onScroll = () => {
      const gap = body.scrollHeight - body.scrollTop - body.clientHeight;
      // Peek/reply always re-dock; full lets the user browse history.
      if (sheet !== "full") {
        dockedRef.current = true;
        return;
      }
      dockedRef.current = gap <= 4;
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(() => stickThreadToLatest());
    resize.observe(body);
    stickThreadToLatest();
    return () => {
      body.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, [sheet, open, scrollBodySelector, cardRef]);

  useEffect(() => {
    if (dragging || sheet !== "peek") {
      return;
    }
    syncLayoutPeek(heightForSnap("peek"));
  }, [sheet, dragging, cardRef]);

  useEffect(() => {
    if (dragging || sheet === "out" || sheet === "full") {
      return;
    }
    // Peek/reply always show the latest context.
    if (sheet === "peek" || sheet === "reply") {
      dockedRef.current = true;
    }
    // Stick through the height + composer open transition so the latest line stays put.
    let alive = true;
    const started = performance.now();
    function tick(now: number) {
      if (!alive) {
        return;
      }
      stickThreadToLatest();
      if (now - started < 520) {
        window.requestAnimationFrame(tick);
      }
    }
    const id = window.requestAnimationFrame(tick);
    return () => {
      alive = false;
      window.cancelAnimationFrame(id);
    };
  }, [sheet, dragging]);

  function dismiss() {
    if (!controlledOpen && !desktopStage) {
      collapseToPeek();
      return;
    }
    setSheet("out");
    clearInlineHeight();
    setDragging(false);
    setDraggingClass(false);
    clearDragChrome();
    setOpen(false);
  }

  function collapseToPeek() {
    steppedAtRef.current = performance.now();
    dockedRef.current = true;
    if (sheet === "peek") {
      setOpen(true);
      clearInlineHeight("peek");
      return;
    }
    if (sheet === "out") {
      setSheet("peek");
      setOpen(true);
      clearInlineHeight("peek");
      setDragging(false);
      setDraggingClass(false);
      clearDragChrome();
      return;
    }
    settleTo("peek");
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
    // Capture immediately so pointermove/up stay on the sheet (Firefox + handle button).
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!pending) {
      setDragging(true);
      setDraggingClass(true);
      paintHeight(startH);
      syncDragChromeFromHeight(startH, 0);
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
    syncDragChromeFromHeight(drag.current.startH, 0);
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
    const replyH = heightForSnap("reply");
    const peekH = heightForSnap("peek");
    if (
      drag.current.from === "peek" &&
      -dy > replyH - peekH + REPLY_DETENT_PX
    ) {
      drag.current.from = "reply";
      drag.current.startH = replyH;
      drag.current.y = event.clientY;
    }
    paintDrag(dy);
    const liveH = conversationSheetDragHeight({
      from: drag.current.from,
      startH: drag.current.startH,
      dy,
      peekH: heightForSnap("peek"),
      replyH: heightForSnap("reply"),
      fullH: heightForSnap("full"),
    });
    syncDragChromeFromHeight(liveH, dy);
    const inPeekBand = liveH <= peekH + PEEK_LAYOUT_BAND_PX;
    // Collapsing into the peek band: stop re-scrolling or the thread jumps.
    if (dy <= 0 || !inPeekBand) {
      stickThreadToLatest();
    }
  }

  function settleTo(next: ConversationSheetSnap) {
    drag.current.on = false;
    drag.current.pending = false;
    drag.current.moved = false;
    if (next === "peek" || next === "reply") {
      dockedRef.current = true;
    }
    steppedAtRef.current = performance.now();
    const peekH = heightForSnap("peek");
    const replyH = heightForSnap("reply");
    const fullH = heightForSnap("full");
    const target = heightForSnap(next);
    const live = cardRef.current?.getBoundingClientRect().height ?? target;
    const peekLayout = next === "peek";
    const collapsingToPeek =
      next === "peek" && live > peekH + PEEK_LAYOUT_BAND_PX;
    setSheet(next);
    if (collapsingToPeek) {
      setDragChrome(
        chromeSnapForHeight(live, peekH, replyH, fullH, { collapsing: true }),
      );
    } else {
      clearDragChrome();
    }
    setDragging(false);
    setDraggingClass(false);
    paintHeight(live, peekLayout);
    setOpen(true);
    if (Math.abs(live - target) < 2) {
      clearDragChrome();
      clearInlineHeight(next);
      return;
    }
    window.requestAnimationFrame(() => {
      paintHeight(target, peekLayout);
      window.setTimeout(() => {
        clearDragChrome();
        clearInlineHeight(next);
      }, 440);
    });
  }

  function settleSheet(dy: number, from: SnapSheetSnap) {
    const velocity = liveVelocity();
    const currentH = conversationSheetDragHeight({
      from,
      startH: drag.current.startH,
      dy,
      peekH: heightForSnap("peek"),
      replyH: heightForSnap("reply"),
      fullH: heightForSnap("full"),
    });
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

  function releaseCapture(event: ReactPointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onCardPointerUp(event: ReactPointerEvent<HTMLElement>) {
    releaseCapture(event);
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
      clearDragChrome();
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
    if (performance.now() - steppedAtRef.current < 400) {
      return;
    }
    if (desktopStage) {
      hide();
      return;
    }
    if (sheet === "full") {
      setSheet("reply");
    } else if (sheet === "reply") {
      collapseToPeek();
    } else {
      steppedAtRef.current = performance.now();
      setSheet("reply");
      setOpen(true);
    }
  }

  function expand() {
    if (performance.now() - steppedAtRef.current < 400) {
      return;
    }
    steppedAtRef.current = performance.now();
    setSheet((current) =>
      stepToward(current === "out" ? "peek" : current, "up"),
    );
    setOpen(true);
  }

  return {
    sheet,
    displaySnap,
    dragComposerOpen,
    dragging,
    setSheet,
    dismiss,
    hide,
    expand,
    collapseToPeek,
    toggleHandle,
    dragMoved: () => drag.current.moved,
    pointerHandlers: {
      // Capture so drags from the handle <button> work in Firefox (no bubble to aside).
      onPointerDownCapture: onCardPointerDown,
      onPointerMove: onCardPointerMove,
      onPointerUp: onCardPointerUp,
      onPointerCancel: onCardPointerUp,
    },
  };
}
