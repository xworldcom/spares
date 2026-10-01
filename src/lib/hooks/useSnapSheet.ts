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
  conversationSheetDragHeight,
  conversationSheetMotionFromHeight,
  conversationSheetPaintedHeight,
  conversationSheetSnapFromHeight,
  type ConversationSheetGesture,
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
    return remPx(10.25);
  }
  const inset = tabBarPx() + headerPx() + 8;
  return Math.min(window.innerHeight * 0.92, window.innerHeight - inset);
}

function nearestSnap(height: number, velocity: number): ConversationSheetSnap {
  const peek = heightForSnap("peek");
  const reply = heightForSnap("reply");
  const full = heightForSnap("full");
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
  scrollBodySelector: string;
  openForUnread?: boolean;
  resetKey?: string;
}) {
  const [sheet, setSheet] = useState<SnapSheetSnap>(() =>
    initialConversationSheetSnap(open, desktopStage, openForUnread),
  );
  /** Height-driven snap while dragging or settling — matches painted motion phases. */
  const [motionSnap, setMotionSnap] = useState<ConversationSheetSnap | null>(null);
  const [motionPhases, setMotionPhases] = useState({ phaseA: 0, phaseB: 0 });
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const drag = useRef({
    y: 0,
    on: false,
    pending: false,
    from: "peek" as SnapSheetSnap,
    startH: 0,
    moved: false,
    samples: [] as { t: number; y: number }[],
    gesture: null as ConversationSheetGesture | null,
    liveH: 0,
  });
  const dockedRef = useRef(true);
  const steppedAtRef = useRef(0);
  const settleFrameRef = useRef(0);

  const controlledOpen = typeof onOpenChange === "function";
  const openForUnreadRef = useRef(openForUnread);
  openForUnreadRef.current = openForUnread;

  const displaySnap = motionSnap ?? sheet;

  function setOpen(next: boolean) {
    onOpenChange?.(next);
  }

  function snapHeights() {
    return {
      peekH: heightForSnap("peek"),
      replyH: heightForSnap("reply"),
      fullH: heightForSnap("full"),
    };
  }

  function paintMotion(liveHeightPx: number, gesture?: ConversationSheetGesture | null) {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const { peekH, replyH, fullH } = snapHeights();
    const motionGesture = gesture ?? drag.current.gesture;
    const paintedHeightPx = conversationSheetPaintedHeight(
      liveHeightPx,
      peekH,
      replyH,
      fullH,
      motionGesture,
    );
    const { phaseA, phaseB } = conversationSheetMotionFromHeight(
      liveHeightPx,
      peekH,
      replyH,
      fullH,
    );
    card.style.setProperty("--sheet-h", `${Math.round(paintedHeightPx)}px`);
    card.style.setProperty("--drag-h", "0px");
    card.style.setProperty("--phase-a", String(phaseA));
    card.style.setProperty("--phase-b", String(phaseB));
    const peekThread = peekH - remPx(2.85);
    const bodyBudget = Math.max(0, paintedHeightPx - remPx(2.85) - remPx(0.88));
    const composerBudget = Math.max(0, replyH - peekH);
    const composerPx = phaseA * composerBudget;
    const threadCap = Math.max(peekThread, bodyBudget - composerPx);
    const threadExtra = phaseB * Math.max(0, threadCap - peekThread);
    card.style.setProperty("--thread-extra-h", `${Math.round(threadExtra)}px`);
    setMotionPhases({ phaseA, phaseB });
    setMotionSnap(conversationSheetSnapFromHeight(liveHeightPx, peekH, replyH, fullH));
    drag.current.liveH = liveHeightPx;
  }

  function clearMotionPaint(atSnap?: ConversationSheetSnap) {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    card.style.removeProperty("--sheet-h");
    card.style.removeProperty("--drag-h");
    card.style.removeProperty("--phase-a");
    card.style.removeProperty("--phase-b");
    card.style.removeProperty("--thread-extra-h");
    const snap = atSnap ?? sheet;
    if (snap === "peek") {
      card.setAttribute("data-layout-peek", "");
    } else {
      card.removeAttribute("data-layout-peek");
    }
  }

  function clearMotionSnap(atSnap?: ConversationSheetSnap) {
    setMotionSnap(null);
    const snap = atSnap ?? sheet;
    const { peekH, replyH, fullH } = snapHeights();
    setMotionPhases(
      conversationSheetMotionFromHeight(heightForSnap(snap), peekH, replyH, fullH),
    );
  }

  function paintDrag(dy: number) {
    const { peekH, replyH, fullH } = snapHeights();
    const live = conversationSheetDragHeight({
      from: drag.current.from,
      startH: drag.current.startH,
      dy,
      peekH,
      replyH,
      fullH,
    });
    paintMotion(live);
  }

  function cancelSettleAnimation() {
    if (settleFrameRef.current) {
      window.cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = 0;
    }
  }

  function setDraggingClass(on: boolean) {
    cardRef.current?.classList.toggle("is-dragging", on);
  }

  function setSettlingClass(on: boolean) {
    cardRef.current?.classList.toggle("is-settling", on);
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
    clearMotionSnap();
    dockedRef.current = true;
    clearMotionPaint();
    setDragging(false);
    setDraggingClass(false);
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
      clearMotionPaint();
      setDragging(false);
      setDraggingClass(false);
      clearMotionSnap();
      return;
    }
    if (!controlledOpen && !desktopStage) {
      setSheet("peek");
      clearMotionPaint();
      setDragging(false);
      setDraggingClass(false);
      clearMotionSnap();
      return;
    }
    setSheet("out");
    clearMotionPaint();
    setDragging(false);
    setDraggingClass(false);
    clearMotionSnap();
  }, [open, desktopStage, cardRef, controlledOpen, openForUnread]);

  useEffect(() => {
    const body = cardRef.current?.querySelector(scrollBodySelector);
    if (!(body instanceof HTMLElement) || sheet === "out") {
      return;
    }
    const onScroll = () => {
      const gap = body.scrollHeight - body.scrollTop - body.clientHeight;
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
    cardRef.current?.setAttribute("data-layout-peek", "");
  }, [sheet, dragging, cardRef]);

  useEffect(() => {
    if (dragging || sheet === "out" || sheet === "full") {
      return;
    }
    if (sheet === "peek" || sheet === "reply") {
      dockedRef.current = true;
    }
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
    clearMotionPaint();
    setDragging(false);
    setDraggingClass(false);
    clearMotionSnap();
    setOpen(false);
  }

  function collapseToPeek() {
    steppedAtRef.current = performance.now();
    dockedRef.current = true;
    if (sheet === "peek") {
      setOpen(true);
      clearMotionPaint("peek");
      return;
    }
    if (sheet === "out") {
      setSheet("peek");
      setOpen(true);
      clearMotionPaint("peek");
      setDragging(false);
      setDraggingClass(false);
      clearMotionSnap();
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
      settleTo("reply");
      return;
    }
    if (sheet === "reply") {
      collapseToPeek();
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
      gesture: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!pending) {
      setDragging(true);
      setDraggingClass(true);
      cardRef.current?.removeAttribute("data-layout-peek");
      paintMotion(startH);
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
    cardRef.current?.removeAttribute("data-layout-peek");
    paintMotion(drag.current.startH);
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
    recordSample(event.clientY);
    if (dy > DRAG_SLOP) {
      drag.current.gesture = "collapsing";
    } else if (dy < -DRAG_SLOP) {
      drag.current.gesture = "expanding";
    }
    const { peekH, replyH, fullH } = snapHeights();
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
      peekH,
      replyH,
      fullH,
    });
    const { phaseB } = conversationSheetMotionFromHeight(
      liveH,
      peekH,
      replyH,
      fullH,
    );
    if (phaseB > 0.02) {
      stickThreadToLatest();
    }
  }

  function settleTo(next: ConversationSheetSnap) {
    cancelSettleAnimation();
    drag.current.on = false;
    drag.current.pending = false;
    drag.current.moved = false;
    if (next === "peek" || next === "reply") {
      dockedRef.current = true;
    }
    steppedAtRef.current = performance.now();
    const target = heightForSnap(next);
    const live =
      drag.current.liveH > 0
        ? drag.current.liveH
        : cardRef.current?.getBoundingClientRect().height ?? target;
    const settleGesture: ConversationSheetGesture | null =
      target < live - 2 ? "collapsing" : target > live + 2 ? "expanding" : null;
    setSheet(next);
    setDragging(false);
    setDraggingClass(false);
    setSettling(true);
    setSettlingClass(true);
    setOpen(true);
    paintMotion(live, settleGesture);
    if (Math.abs(live - target) < 2) {
      setSettling(false);
      setSettlingClass(false);
      clearMotionSnap(next);
      clearMotionPaint(next);
      return;
    }
    const settleStarted = performance.now();
    const settleDurationMs = 440;
    const startLive = live;
    window.requestAnimationFrame(() => {
      const tick = () => {
        const elapsed = performance.now() - settleStarted;
        const t = Math.min(1, elapsed / settleDurationMs);
        const eased = 1 - (1 - t) ** 3;
        const interpolatedLive = startLive + (target - startLive) * eased;
        paintMotion(interpolatedLive, settleGesture);
        if (elapsed < settleDurationMs) {
          settleFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }
        settleFrameRef.current = 0;
        setSettling(false);
        setSettlingClass(false);
        clearMotionSnap(next);
        clearMotionPaint(next);
      };
      settleFrameRef.current = window.requestAnimationFrame(tick);
    });
  }

  function settleSheet(dy: number, from: SnapSheetSnap) {
    const velocity = liveVelocity();
    const { peekH, replyH, fullH } = snapHeights();
    const currentH = conversationSheetDragHeight({
      from,
      startH: drag.current.startH,
      dy,
      peekH,
      replyH,
      fullH,
    });
    if (Math.abs(dy) < 28 && Math.abs(velocity) < 0.3) {
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
      clearMotionSnap();
      clearMotionPaint();
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
      settleTo("reply");
    } else if (sheet === "reply") {
      collapseToPeek();
    } else {
      settleTo("reply");
    }
  }

  function expand() {
    if (performance.now() - steppedAtRef.current < 400) {
      return;
    }
    steppedAtRef.current = performance.now();
    settleTo(stepToward(sheet === "out" ? "peek" : sheet, "up"));
  }

  return {
    sheet,
    displaySnap,
    motionPhaseA: motionPhases.phaseA,
    motionPhaseB: motionPhases.phaseB,
    settling,
    dragging,
    setSheet,
    dismiss,
    hide,
    expand,
    collapseToPeek,
    toggleHandle,
    dragMoved: () => drag.current.moved,
    pointerHandlers: {
      onPointerDownCapture: onCardPointerDown,
      onPointerMove: onCardPointerMove,
      onPointerUp: onCardPointerUp,
      onPointerCancel: onCardPointerUp,
    },
  };
}
