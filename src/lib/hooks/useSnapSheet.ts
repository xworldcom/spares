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
  conversationSheetMotionFromHeight,
  conversationSheetSnapFromHeight,
  type ConversationSheetGesture,
  initialConversationSheetSnap,
  type ConversationSheetSnap,
} from "@/lib/ui/conversation-sheet";

const DRAG_SLOP = 8;
const SAMPLE_WINDOW_MS = 90;

export type SnapSheetSnap = ConversationSheetSnap;

const STAGE_ORDER: ConversationSheetSnap[] = ["reply", "full"];

function remPx(rem: number) {
  if (typeof window === "undefined") {
    return rem * 16;
  }
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return rem * (Number.isFinite(root) && root > 0 ? root : 16);
}

function blockExtentPx(node: HTMLElement): number {
  const style = getComputedStyle(node);
  const mt = Number.parseFloat(style.marginTop) || 0;
  const mb = Number.parseFloat(style.marginBottom) || 0;
  return node.offsetHeight + mt + mb;
}

function measureThreadContextBandPx(card: HTMLElement, maxRows = 2): number {
  const thread = card.querySelector(".imsg-thread");
  if (!(thread instanceof HTMLElement)) {
    return remPx(4.25);
  }
  const style = getComputedStyle(thread);
  const pt = Number.parseFloat(style.paddingTop) || 0;
  const pb = Number.parseFloat(style.paddingBottom) || 0;
  const rowGap = Number.parseFloat(style.gap) || Number.parseFloat(style.rowGap) || 0;
  const rows = thread.querySelectorAll(":scope > .imsg-row");
  if (rows.length === 0) {
    return pt + pb + remPx(3.5);
  }
  const take = Math.min(maxRows, rows.length);
  let rowsH = 0;
  for (let i = rows.length - take; i < rows.length; i++) {
    const row = rows[i];
    if (row instanceof HTMLElement) {
      rowsH += blockExtentPx(row);
    }
  }
  if (take > 1) {
    rowsH += rowGap * (take - 1);
  }
  return pt + rowsH + pb + remPx(0.35);
}

function measureReplyVisiblePx(card: HTMLElement): number {
  const handle = card.querySelector(
    ":scope > .snap-sheet-handle, :scope > .quote-sheet-handle",
  );
  if (!(handle instanceof HTMLElement)) {
    return 0;
  }
  const cardRect = card.getBoundingClientRect();
  const handleTop = handle.getBoundingClientRect().top;
  return Math.ceil(cardRect.bottom - handleTop);
}

function measureDetentHeights(card: HTMLElement | null) {
  const replyFallback = remPx(17.5);
  const composerFallback = remPx(4);
  if (!card) {
    return { replyH: replyFallback, composerH: composerFallback };
  }
  let chrome = 0;
  for (const selector of [
    ":scope > .snap-sheet-handle",
    ":scope > .quote-sheet-handle",
    ":scope > .conversation-sheet-toolbar",
  ]) {
    const node = card.querySelector(selector);
    if (node instanceof HTMLElement) {
      chrome += blockExtentPx(node);
    }
  }
  const composer = card.querySelector(".imsg-composer");
  const composerH =
    composer instanceof HTMLElement && composer.offsetHeight > 0
      ? composer.offsetHeight
      : composerFallback;
  const stackGap = remPx(0.35);
  const stackReply = Math.ceil(
    chrome + measureThreadContextBandPx(card, 2) + composerH + stackGap,
  );
  const replyFromHandle = measureReplyVisiblePx(card);
  const replyH = Math.max(replyFallback, replyFromHandle, stackReply);
  return { replyH, composerH };
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

function openHeightPx(card?: Element | null) {
  if (card instanceof HTMLElement) {
    const maxH = Number.parseFloat(getComputedStyle(card).maxHeight);
    if (Number.isFinite(maxH) && maxH > 120) {
      return maxH;
    }
  }
  const inset = tabBarPx() + headerPx() + 8;
  return Math.min(window.innerHeight * 0.92, window.innerHeight - inset);
}

function heightForSnap(snap: ConversationSheetSnap, card?: Element | null) {
  if (snap === "out") {
    return 0;
  }
  const { replyH } = measureDetentHeights(card instanceof HTMLElement ? card : null);
  if (snap === "peek" || snap === "reply") {
    return replyH;
  }
  return openHeightPx(card);
}

function nearestSnap(
  height: number,
  velocity: number,
  card?: Element | null,
): ConversationSheetSnap {
  const reply = heightForSnap("reply", card);
  const full = heightForSnap("full", card);
  if (velocity < -0.45) {
    return "full";
  }
  if (velocity > 0.45) {
    return "reply";
  }
  const mid = (reply + full) / 2;
  return height < mid ? "reply" : "full";
}

function stepToward(
  from: ConversationSheetSnap,
  direction: "up" | "down",
): ConversationSheetSnap {
  if (from === "out") {
    return direction === "up" ? "reply" : "out";
  }
  if (from === "peek") {
    return direction === "up" ? "reply" : "reply";
  }
  const index = STAGE_ORDER.indexOf(from);
  if (index < 0) {
    return "reply";
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
  const [motionSnap, setMotionSnap] = useState<ConversationSheetSnap | null>(null);
  const [motionPhases, setMotionPhases] = useState({ phaseA: 0, phaseB: 0 });
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const drag = useRef({
    y: 0,
    on: false,
    pending: false,
    from: "reply" as SnapSheetSnap,
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
    const card = cardRef.current;
    const { replyH } = measureDetentHeights(card instanceof HTMLElement ? card : null);
    const peekH = replyH;
    const fullH = openHeightPx(card instanceof HTMLElement ? card : null);
    return { peekH, replyH, fullH };
  }

  function paintMotion(liveHeightPx: number, _gesture?: ConversationSheetGesture | null) {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const { peekH, replyH, fullH } = snapHeights();
    const { phaseA, phaseB } = conversationSheetMotionFromHeight(
      liveHeightPx,
      peekH,
      replyH,
      fullH,
    );
    card.setAttribute("data-motion-live", "");
    card.style.setProperty("--sheet-h", `${Math.round(liveHeightPx)}px`);
    card.style.setProperty("--reply-h", `${Math.round(replyH)}px`);
    card.style.setProperty("--full-h", `${Math.round(fullH)}px`);
    card.style.setProperty("--phase-a", String(phaseA));
    card.style.setProperty("--phase-b", String(phaseB));
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
    card.style.removeProperty("--phase-a");
    card.style.removeProperty("--phase-b");
    card.removeAttribute("data-motion-live");
    const snap = atSnap ?? sheet;
    const { replyH, fullH } = snapHeights();
    card.style.setProperty("--reply-h", `${Math.round(replyH)}px`);
    card.style.setProperty("--full-h", `${Math.round(fullH)}px`);
    card.removeAttribute("data-layout-peek");
  }

  function clearMotionSnap(atSnap?: ConversationSheetSnap) {
    setMotionSnap(null);
    const snap = atSnap ?? sheet;
    const { peekH, replyH, fullH } = snapHeights();
    setMotionPhases(
      conversationSheetMotionFromHeight(heightForSnap(snap, cardRef.current), peekH, replyH, fullH),
    );
  }

  function paintDrag(dy: number) {
    const { peekH, replyH, fullH } = snapHeights();
    const live = conversationSheetDragHeight({
      from: drag.current.from === "peek" ? "reply" : drag.current.from,
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
      setSheet("reply");
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
    if (dragging || settling || desktopStage || sheet === "out") {
      return;
    }
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const { replyH, fullH } = snapHeights();
    card.style.setProperty("--reply-h", `${Math.round(replyH)}px`);
    card.style.setProperty("--full-h", `${Math.round(fullH)}px`);
  }, [sheet, dragging, settling, desktopStage, cardRef]);

  useEffect(() => {
    if (dragging || sheet === "out" || sheet === "full") {
      return;
    }
    dockedRef.current = true;
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
    if (sheet === "reply" || sheet === "peek") {
      setOpen(true);
      clearMotionPaint("reply");
      return;
    }
    if (sheet === "out") {
      setSheet("reply");
      setOpen(true);
      clearMotionPaint("reply");
      setDragging(false);
      setDraggingClass(false);
      clearMotionSnap();
      return;
    }
    settleTo("reply");
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
    dismiss();
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    from: SnapSheetSnap,
    pending: boolean,
  ) {
    const normalized = from === "peek" ? "reply" : from;
    const startH =
      cardRef.current?.getBoundingClientRect().height ?? heightForSnap(normalized, cardRef.current);
    drag.current = {
      y: event.clientY,
      on: !pending,
      pending,
      from: normalized,
      startH,
      moved: false,
      samples: [{ t: performance.now(), y: event.clientY }],
      gesture: null,
      liveH: startH,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!pending) {
      setDragging(true);
      setDraggingClass(true);
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
    beginDrag(
      event,
      sheet === "out" ? "reply" : sheet,
      sheet === "reply" || sheet === "full",
    );
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
    paintMotion(drag.current.startH);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCardPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending) {
      const dy = event.clientY - drag.current.y;
      const from = drag.current.from;
      if (from === "reply") {
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
    paintDrag(dy);
  }

  function settleTo(next: ConversationSheetSnap) {
    cancelSettleAnimation();
    drag.current.on = false;
    drag.current.pending = false;
    drag.current.moved = false;
    if (next === "peek") {
      next = "reply";
    }
    if (next === "reply") {
      dockedRef.current = true;
    } else if (next === "full") {
      const body = cardRef.current?.querySelector(scrollBodySelector);
      if (body instanceof HTMLElement) {
        const gap = body.scrollHeight - body.scrollTop - body.clientHeight;
        dockedRef.current = gap <= 4;
      } else {
        dockedRef.current = false;
      }
    }
    steppedAtRef.current = performance.now();
    const target = heightForSnap(next, cardRef.current);
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
      from: from === "peek" ? "reply" : from,
      startH: drag.current.startH,
      dy,
      peekH,
      replyH,
      fullH,
    });
    if (Math.abs(dy) < 28 && Math.abs(velocity) < 0.3) {
      if (dy < -12 || velocity < -0.2) {
        settleTo(stepToward(from === "out" ? "reply" : from, "up"));
        return;
      }
      if (dy > 12 || velocity > 0.2) {
        settleTo(stepToward(from === "out" ? "reply" : from, "down"));
        return;
      }
      settleTo(from === "out" ? "reply" : from === "peek" ? "reply" : from);
      return;
    }
    settleTo(nearestSnap(currentH, velocity, cardRef.current));
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
      if (from === "reply") {
        settleTo(stepToward(from, "up"));
      } else if (from === "full" && Math.abs(event.clientY - drag.current.y) < DRAG_SLOP) {
        setDragging(false);
        setDraggingClass(false);
        clearMotionSnap();
        clearMotionPaint();
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
      if (from === "reply") {
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
    } else {
      settleTo("full");
    }
  }

  function expand() {
    if (performance.now() - steppedAtRef.current < 400) {
      return;
    }
    steppedAtRef.current = performance.now();
    settleTo(stepToward(sheet === "out" ? "reply" : sheet, "up"));
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
