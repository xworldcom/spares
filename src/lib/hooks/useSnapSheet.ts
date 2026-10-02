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
  conversationSheetMetrics,
  conversationSheetMotionFromTranslate,
  conversationSheetSnapFromTranslate,
  conversationSheetTranslateForSnap,
  conversationSheetClipBottomForTop,
  conversationSheetDragTranslate,
  conversationSheetVisibleHeight,
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

/** offsetHeight + vertical margins (clip stack uses margin on the drag handle). */
function blockExtentPx(node: HTMLElement): number {
  const style = getComputedStyle(node);
  const mt = Number.parseFloat(style.marginTop) || 0;
  const mb = Number.parseFloat(style.marginBottom) || 0;
  return node.offsetHeight + mt + mb;
}

/** Latest context above the composer — padding, gap, and up to two trailing rows (status chips). */
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

function paintDetentCssVars(
  card: HTMLElement,
  peekVisibleH: number,
  replyH: number,
  openH: number,
  composerH: number,
) {
  card.style.setProperty("--peek-h", `${Math.round(peekVisibleH)}px`);
  card.style.setProperty("--reply-h", `${Math.round(replyH)}px`);
  card.style.setProperty("--full-h", `${Math.round(openH)}px`);
  card.style.setProperty("--composer-clip-h", `${Math.round(composerH)}px`);
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
    const boxH = card.getBoundingClientRect().height;
    if (Number.isFinite(boxH) && boxH > 120) {
      return boxH;
    }
  }
  const inset = tabBarPx() + headerPx() + 8;
  return Math.min(window.innerHeight * 0.92, window.innerHeight - inset);
}

/** Bottom-anchored clip: intermediate must include handle → card floor. */
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

/** Closed = chrome + latest row; intermediate = handle through composer to card floor. */
function measureDetentHeights(card: HTMLElement | null) {
  const peekVisibleFallback = remPx(4.5);
  const replyFallback = remPx(17.5);
  const composerFallback = remPx(4);
  if (!card) {
    return {
      peekVisibleH: peekVisibleFallback,
      replyH: replyFallback,
      composerH: composerFallback,
    };
  }
  const handle = card.querySelector(
    ":scope > .snap-sheet-handle, :scope > .quote-sheet-handle",
  );
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
  // Composer uses margin-top:auto in the flex column — never count that margin in detents.
  const composerH =
    composer instanceof HTMLElement && composer.offsetHeight > 0
      ? composer.offsetHeight
      : composerFallback;
  const threadBand = measureThreadContextBandPx(card, 1);
  const stackGap = remPx(0.35);
  const stackPeek = Math.ceil(chrome + threadBand + stackGap);
  const handleToComposer =
    handle instanceof HTMLElement &&
    composer instanceof HTMLElement &&
    composer.getBoundingClientRect().top > handle.getBoundingClientRect().top
      ? Math.ceil(
          composer.getBoundingClientRect().top - handle.getBoundingClientRect().top,
        )
      : 0;
  const peekVisibleH = Math.max(peekVisibleFallback, stackPeek, handleToComposer);
  const replyFromHandle = measureReplyVisiblePx(card);
  const stackReply = Math.ceil(
    chrome + measureThreadContextBandPx(card, 2) + composerH + stackGap,
  );
  const replyH = Math.max(replyFallback, replyFromHandle, stackReply);
  return { peekVisibleH, replyH, composerH };
}

function heightForSnap(snap: ConversationSheetSnap, card?: Element | null) {
  if (snap === "out") {
    return 0;
  }
  const { peekVisibleH, replyH } = measureDetentHeights(
    card instanceof HTMLElement ? card : null,
  );
  if (snap === "peek") {
    return peekVisibleH;
  }
  if (snap === "reply") {
    return replyH;
  }
  return openHeightPx(card);
}

function nearestSnap(
  translateY: number,
  velocity: number,
  card?: Element | null,
): ConversationSheetSnap {
  const peekH = heightForSnap("peek", card);
  const replyH = heightForSnap("reply", card);
  const openH = heightForSnap("full", card);
  const { composerH } = measureDetentHeights(card instanceof HTMLElement ? card : null);
  const metrics = conversationSheetMetrics(peekH, replyH, openH, composerH);
  if (velocity < -0.45) {
    if (translateY > metrics.yIntermediate + 24) {
      return "reply";
    }
    return "full";
  }
  if (velocity > 0.45) {
    if (translateY < metrics.yIntermediate - 24) {
      return "reply";
    }
    return "peek";
  }
  const midClosedIntermediate = (metrics.yClosed + metrics.yIntermediate) / 2;
  const midIntermediateOpen = (metrics.yIntermediate + metrics.yOpen) / 2;
  if (translateY > midClosedIntermediate) {
    return "peek";
  }
  if (translateY > midIntermediateOpen) {
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
    startY: 0,
    moved: false,
    samples: [] as { t: number; y: number }[],
    gesture: null as ConversationSheetGesture | null,
    liveY: 0,
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
    const measured = measureDetentHeights(card instanceof HTMLElement ? card : null);
    const openH = openHeightPx(card instanceof HTMLElement ? card : null);
    const metrics = conversationSheetMetrics(
      measured.peekVisibleH,
      measured.replyH,
      openH,
      measured.composerH,
    );
    return {
      peekVisibleH: measured.peekVisibleH,
      peekH: measured.peekVisibleH,
      replyH: measured.replyH,
      composerH: measured.composerH,
      openH,
      metrics,
    };
  }

  function paintMotion(liveY: number, _gesture?: ConversationSheetGesture | null) {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const { metrics, peekH, replyH, openH, composerH } = snapHeights();
    const clipBottom = conversationSheetClipBottomForTop(liveY, metrics);
    const { phaseA, phaseB } = conversationSheetMotionFromTranslate(liveY, metrics);
    card.setAttribute("data-motion-live", "");
    paintDetentCssVars(card, peekH, replyH, openH, composerH);
    card.style.setProperty("--sheet-clip-top", `${Math.round(liveY)}px`);
    card.style.setProperty("--sheet-clip-bottom", `${Math.round(clipBottom)}px`);
    card.style.setProperty("--phase-a", String(phaseA));
    card.style.setProperty("--phase-b", String(phaseB));
    setMotionPhases({ phaseA, phaseB });
    setMotionSnap(conversationSheetSnapFromTranslate(liveY, metrics));
    drag.current.liveY = liveY;
  }

  function clearMotionPaint(atSnap?: ConversationSheetSnap) {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    card.style.removeProperty("--phase-a");
    card.style.removeProperty("--phase-b");
    card.removeAttribute("data-motion-live");
    const snap = atSnap ?? sheet;
    if (snap === "out") {
      card.style.removeProperty("--sheet-clip-top");
      card.style.removeProperty("--sheet-clip-bottom");
    } else {
      const { metrics, peekH, replyH, openH, composerH } = snapHeights();
      const top = conversationSheetTranslateForSnap(snap, metrics);
      paintDetentCssVars(card, peekH, replyH, openH, composerH);
      card.style.setProperty("--sheet-clip-top", `${Math.round(top)}px`);
      card.style.setProperty(
        "--sheet-clip-bottom",
        `${Math.round(conversationSheetClipBottomForTop(top, metrics))}px`,
      );
    }
    if (snap === "peek") {
      card.setAttribute("data-layout-peek", "");
    } else {
      card.removeAttribute("data-layout-peek");
    }
  }

  function clearMotionSnap(atSnap?: ConversationSheetSnap) {
    setMotionSnap(null);
    const snap = atSnap ?? sheet;
    const { metrics } = snapHeights();
    const y = conversationSheetTranslateForSnap(snap, metrics);
    setMotionPhases(conversationSheetMotionFromTranslate(y, metrics));
  }

  function paintDrag(dy: number) {
    const { metrics } = snapHeights();
    const liveY = conversationSheetDragTranslate({
      from: drag.current.from,
      startY: drag.current.startY,
      dy,
      metrics,
    });
    paintMotion(liveY);
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
    if (dragging || settling || desktopStage || sheet === "out") {
      return;
    }
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const { metrics, peekH, replyH, openH, composerH } = snapHeights();
    const top = conversationSheetTranslateForSnap(sheet, metrics);
    paintDetentCssVars(card, peekH, replyH, openH, composerH);
    card.style.setProperty("--sheet-clip-top", `${Math.round(top)}px`);
    card.style.setProperty(
      "--sheet-clip-bottom",
      `${Math.round(conversationSheetClipBottomForTop(top, metrics))}px`,
    );
  }, [sheet, dragging, settling, desktopStage, cardRef]);

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
    const { metrics } = snapHeights();
    const startY =
      drag.current.liveY > 0
        ? drag.current.liveY
        : conversationSheetTranslateForSnap(from === "out" ? "peek" : from, metrics);
    drag.current = {
      y: event.clientY,
      on: !pending,
      pending,
      from,
      startY,
      moved: false,
      samples: [{ t: performance.now(), y: event.clientY }],
      gesture: null,
      liveY: startY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!pending) {
      setDragging(true);
      setDraggingClass(true);
      cardRef.current?.removeAttribute("data-layout-peek");
      paintMotion(startY);
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
    paintMotion(drag.current.startY);
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
    const { metrics, peekH, replyH } = snapHeights();
    if (
      drag.current.from === "peek" &&
      -dy > replyH - peekH + REPLY_DETENT_PX
    ) {
      drag.current.from = "reply";
      drag.current.startY = metrics.yIntermediate;
      drag.current.y = event.clientY;
    }
    paintDrag(dy);
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
    const { metrics } = snapHeights();
    const target = conversationSheetTranslateForSnap(next, metrics);
    const live =
      drag.current.liveY > 0
        ? drag.current.liveY
        : conversationSheetTranslateForSnap(sheet, metrics);
    const settleGesture: ConversationSheetGesture | null =
      target > live + 2 ? "collapsing" : target < live - 2 ? "expanding" : null;
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
    const { metrics } = snapHeights();
    const currentY = conversationSheetDragTranslate({
      from,
      startY: drag.current.startY,
      dy,
      metrics,
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
    settleTo(nearestSnap(currentY, velocity, cardRef.current));
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
