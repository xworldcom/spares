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
import {
  applyThreadScrollerLayout,
  flushPinThreadScrollerToComposer,
  pinThreadScrollerToComposer,
} from "@/lib/ui/conversation-sheet-thread-pin";
import {
  conversationSheetFullHeightPx,
  safeAreaBottomPx,
} from "@/lib/ui/conversation-sheet-viewport";

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
  // Resting intermediate height only — never tie replyH to the live sheet height during drag.
  let replyH = Math.max(replyFallback, stackReply);
  const fullCap = openHeightPx(card);
  const minGap = remPx(2.75);
  if (replyH >= fullCap - minGap) {
    replyH = Math.max(replyFallback, Math.min(stackReply, fullCap * 0.52));
  }
  if (replyH >= fullCap - minGap) {
    replyH = Math.max(replyFallback, fullCap - minGap);
  }
  return { replyH, composerH };
}

function openHeightPx(card?: Element | null) {
  const maxFromViewport = conversationSheetFullHeightPx();
  if (card instanceof HTMLElement) {
    const maxH = Number.parseFloat(getComputedStyle(card).maxHeight);
    if (Number.isFinite(maxH) && maxH > 120) {
      return Math.min(maxH, maxFromViewport);
    }
  }
  return maxFromViewport;
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
  if (from === "reply") {
    return "out";
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
  inlineLayout,
  resetKey,
  /** Quote Messages: Close from full settles to reply (not care translate). */
  closeProfile = "care",
}: {
  cardRef: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  desktopStage: boolean;
  scrollBodySelector: string;
  inlineLayout?: boolean;
  resetKey?: string;
  closeProfile?: "care" | "quote";
}) {
  const [sheet, setSheet] = useState<SnapSheetSnap>(() =>
    initialConversationSheetSnap(open, desktopStage, inlineLayout),
  );
  const [motionSnap, setMotionSnap] = useState<ConversationSheetSnap | null>(null);
  const [motionPhases, setMotionPhases] = useState({ phaseA: 0, phaseB: 0 });
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [threadDocked, setThreadDocked] = useState(true);
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
    mode: null as "height" | "close" | null,
    startTy: 0,
    closeMax: 0,
    liveTy: 0,
  });
  const closeMaxRef = useRef(0);
  const dockedRef = useRef(true);

  function setThreadDockedState(docked: boolean) {
    dockedRef.current = docked;
    setThreadDocked(docked);
  }
  const steppedAtRef = useRef(0);
  const settleFrameRef = useRef(0);
  const motionHeightsRef = useRef<{ replyH: number; fullH: number } | null>(null);
  const closeSettleRef = useRef(false);

  const controlledOpen = typeof onOpenChange === "function";
  const displaySnap = motionSnap ?? sheet;

  function setOpen(next: boolean) {
    onOpenChange?.(next);
  }

  /** Close translate + resting closed: never re-pin or write scrollTop on the thread. */
  function isCloseThreadScrollLocked(): boolean {
    if (sheet === "out") {
      return true;
    }
    const card = cardRef.current;
    if (card?.hasAttribute("data-close-translate")) {
      return true;
    }
    if (dragging && drag.current.mode === "close") {
      return true;
    }
    if (closeSettleRef.current) {
      return true;
    }
    return false;
  }

  function measureCloseOffsetPx(card: HTMLElement | null) {
    if (!card) {
      return remPx(4) + safeAreaBottomPx();
    }
    const composer = card.querySelector(".imsg-composer");
    const composerH =
      composer instanceof HTMLElement && composer.offsetHeight > 0
        ? composer.offsetHeight
        : remPx(4);
    return Math.ceil(composerH + safeAreaBottomPx());
  }

  function lockCloseOffset() {
    const card = cardRef.current;
    const max = measureCloseOffsetPx(card instanceof HTMLElement ? card : null);
    closeMaxRef.current = max;
    drag.current.closeMax = max;
    return max;
  }

  function readCloseTyPx(card: HTMLElement) {
    const inline = card.style.getPropertyValue("--sheet-close-ty").trim();
    if (inline.endsWith("px")) {
      const parsed = Number.parseFloat(inline);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    const rest = getComputedStyle(card).getPropertyValue("--sheet-close-rest-ty").trim();
    if (rest.endsWith("px")) {
      const parsed = Number.parseFloat(rest);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return sheet === "out" ? closeMaxRef.current || lockCloseOffset() : 0;
  }

  function paintCloseTy(tyPx: number) {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const max = lockCloseOffset();
    drag.current.closeMax = max;
    const ty = Math.max(0, Math.min(max, tyPx));
    card.setAttribute("data-close-translate", "");
    card.style.setProperty("--sheet-close-ty", `${Math.round(ty)}px`);
    drag.current.liveTy = ty;
  }

  function clearCloseTranslate(atSnap?: ConversationSheetSnap) {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const snap = atSnap ?? sheet;
    const max = closeMaxRef.current || lockCloseOffset();
    card.removeAttribute("data-close-translate");
    if (snap === "out") {
      card.style.setProperty("--sheet-close-rest-ty", `${max}px`);
      card.style.setProperty("--sheet-close-ty", `${max}px`);
      drag.current.liveTy = max;
      return;
    }
    card.style.removeProperty("--sheet-close-rest-ty");
    card.style.setProperty("--sheet-close-ty", "0px");
    drag.current.liveTy = 0;
  }

  function snapHeights() {
    const card = cardRef.current;
    const { replyH } = measureDetentHeights(card instanceof HTMLElement ? card : null);
    const peekH = replyH;
    const fullH = openHeightPx(card instanceof HTMLElement ? card : null);
    return { peekH, replyH, fullH };
  }

  function lockMotionHeights() {
    const { replyH, fullH } = snapHeights();
    motionHeightsRef.current = { replyH, fullH };
  }

  function clearMotionHeights() {
    motionHeightsRef.current = null;
  }

  function heightsForMotion() {
    if (motionHeightsRef.current) {
      const { replyH, fullH } = motionHeightsRef.current;
      return { peekH: replyH, replyH, fullH };
    }
    return snapHeights();
  }

  function resetThreadScrollForMotion(_from: SnapSheetSnap) {
    setThreadDockedState(true);
    const body = cardRef.current?.querySelector(scrollBodySelector);
    if (body instanceof HTMLElement) {
      // Flex-end motion layout pins the latest row; clear scroll so close does not jump.
      body.scrollTop = 0;
    }
  }

  function prepareThreadForSheetMotion(from: SnapSheetSnap) {
    cardRef.current?.classList.add("is-dragging");
    if (drag.current.mode === "close") {
      return;
    }
    resetThreadScrollForMotion(from);
  }

  function paintMotion(liveHeightPx: number, _gesture?: ConversationSheetGesture | null) {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const { peekH, replyH, fullH } = heightsForMotion();
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
    clearMotionHeights();
    const body = card.querySelector(scrollBodySelector);
    if (body instanceof HTMLElement) {
      applyThreadScrollerLayout(body);
      if (dockedRef.current) {
        flushPinThreadScrollerToComposer(body, true);
      }
    }
    requestAnimationFrame(() => {
      syncThreadLayoutFromDom();
    });
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
    const { peekH, replyH, fullH } = heightsForMotion();
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

  function syncThreadLayoutFromDom() {
    if (isCloseThreadScrollLocked()) {
      return;
    }
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const body = card.querySelector(scrollBodySelector);
    if (!(body instanceof HTMLElement)) {
      return;
    }
    const inMotion =
      card.classList.contains("is-dragging") ||
      card.classList.contains("is-settling") ||
      card.hasAttribute("data-motion-live");
    if (inMotion) {
      if (dockedRef.current) {
        body.scrollTop = 0;
      }
      return;
    }
    applyThreadScrollerLayout(body);
    if (dockedRef.current) {
      pinThreadScrollerToComposer(body, true);
    }
  }

  useEffect(() => {
    if (!resetKey) {
      return;
    }
    setSheet(
      initialConversationSheetSnap(open, desktopStage, inlineLayout),
    );
    clearMotionSnap();
    setThreadDockedState(true);
    clearMotionPaint();
    setDragging(false);
    setDraggingClass(false);
  }, [resetKey, open, desktopStage, inlineLayout, cardRef]);

  useEffect(() => {
    if (open) {
      setSheet((current) => {
        if (current !== "out") {
          return current;
        }
        return initialConversationSheetSnap(true, desktopStage, inlineLayout);
      });
      setThreadDockedState(true);
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
  }, [open, desktopStage, inlineLayout, cardRef, controlledOpen]);

  useEffect(() => {
    const body = cardRef.current?.querySelector(scrollBodySelector);
    if (!(body instanceof HTMLElement) || sheet === "out") {
      return;
    }
    const onScroll = () => {
      const gap = body.scrollHeight - body.scrollTop - body.clientHeight;
      if (sheet !== "full") {
        setThreadDockedState(true);
        return;
      }
      setThreadDockedState(gap <= 4);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(() => {
      if (isCloseThreadScrollLocked()) {
        return;
      }
      const card = cardRef.current;
      if (
        !card ||
        card.classList.contains("is-dragging") ||
        card.classList.contains("is-settling") ||
        card.hasAttribute("data-motion-live")
      ) {
        return;
      }
      syncThreadLayoutFromDom();
    });
    resize.observe(body);
    syncThreadLayoutFromDom();
    return () => {
      body.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, [sheet, open, scrollBodySelector, cardRef]);

  useEffect(() => {
    if (dragging || settling || desktopStage) {
      return;
    }
    if (sheet === "out") {
      clearCloseTranslate("out");
      return;
    }
    if (sheet === "reply") {
      clearCloseTranslate("reply");
    }
  }, [sheet, dragging, settling, desktopStage]);

  function paintDetentHeightVars() {
    const card = cardRef.current;
    if (!card || desktopStage) {
      return;
    }
    const { replyH, fullH } = snapHeights();
    card.style.setProperty("--reply-h", `${Math.round(replyH)}px`);
    card.style.setProperty("--full-h", `${Math.round(fullH)}px`);
  }

  useEffect(() => {
    if (dragging || settling || desktopStage || sheet === "out") {
      return;
    }
    paintDetentHeightVars();
  }, [sheet, dragging, settling, desktopStage, cardRef]);

  useEffect(() => {
    if (desktopStage) {
      return;
    }
    const refresh = () => {
      if (dragging || settling || sheet === "out") {
        return;
      }
      paintDetentHeightVars();
    };
    window.addEventListener("scroll", refresh, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", refresh);
    vv?.addEventListener("scroll", refresh);
    return () => {
      window.removeEventListener("scroll", refresh);
      vv?.removeEventListener("resize", refresh);
      vv?.removeEventListener("scroll", refresh);
    };
  }, [sheet, dragging, settling, desktopStage, cardRef]);

  useEffect(() => {
    if (dragging || settling || sheet === "out" || sheet === "full" || isCloseThreadScrollLocked()) {
      return;
    }
    setThreadDockedState(true);
    let alive = true;
    const started = performance.now();
    function tick(now: number) {
      if (!alive) {
        return;
      }
      syncThreadLayoutFromDom();
      if (now - started < 520) {
        window.requestAnimationFrame(tick);
      }
    }
    const id = window.requestAnimationFrame(tick);
    return () => {
      alive = false;
      window.cancelAnimationFrame(id);
    };
  }, [sheet, dragging, settling]);

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
    setThreadDockedState(true);
    if (sheet === "reply" || sheet === "peek") {
      setOpen(true);
      clearMotionPaint("reply");
      clearCloseTranslate("reply");
      return;
    }
    if (sheet === "out") {
      settleCloseTo("reply");
      return;
    }
    settleTo("reply");
  }

  /** Resting peek band — CSS `is-peek`, not reply height (settleTo("peek") used to expand). */
  function settleToVisualPeek() {
    cancelSettleAnimation();
    drag.current.on = false;
    drag.current.pending = false;
    drag.current.moved = false;
    steppedAtRef.current = performance.now();
    setDragging(false);
    setDraggingClass(false);
    setSettling(false);
    setSettlingClass(false);
    cardRef.current?.classList.remove("is-dragging");
    setThreadDockedState(true);
    setOpen(true);
    setSheet("peek");
    clearMotionSnap("peek");
    clearMotionPaint("peek");
    clearCloseTranslate("peek");
  }

  /** Toolbar Close — care uses `--sheet-close-ty`; quote Messages rolls full → reply → out. */
  function closeViaTranslate() {
    if (desktopStage || sheet === "out") {
      return;
    }
    if (dragging || settling) {
      return;
    }
    if (performance.now() - steppedAtRef.current < 400) {
      return;
    }
    steppedAtRef.current = performance.now();
    setThreadDockedState(true);
    if (closeProfile === "quote") {
      if (sheet === "full") {
        clearCloseTranslate("peek");
        settleToVisualPeek();
        return;
      }
      if (sheet === "reply") {
        settleToVisualPeek();
        return;
      }
      if (sheet === "peek") {
        settleCloseTo("out");
        return;
      }
      steppedAtRef.current = performance.now();
      setThreadDockedState(true);
      const max = lockCloseOffset();
      setSheet("out");
      clearMotionPaint("out");
      clearCloseTranslate("out");
      cardRef.current?.style.setProperty("--sheet-close-rest-ty", `${max}px`);
      cardRef.current?.style.setProperty("--sheet-close-ty", `${max}px`);
      cardRef.current?.setAttribute("data-close-translate", "");
      closeSettleRef.current = true;
      setOpen(false);
      return;
    }
    if (sheet === "full" || sheet === "reply") {
      clearCloseTranslate("peek");
      settleToVisualPeek();
      return;
    }
    if (sheet === "peek") {
      settleCloseTo("out");
      return;
    }
    settleCloseTo("out");
  }

  function settleCloseTo(next: "reply" | "out") {
    cancelSettleAnimation();
    closeSettleRef.current = true;
    drag.current.on = false;
    drag.current.pending = false;
    drag.current.moved = false;
    drag.current.mode = "close";
    const max = drag.current.closeMax || lockCloseOffset();
    const targetTy = next === "out" ? max : 0;
    const live = drag.current.liveTy > 0 ? drag.current.liveTy : readCloseTyPx(cardRef.current!);
    steppedAtRef.current = performance.now();
    setDragging(false);
    setDraggingClass(false);
    cardRef.current?.classList.remove("is-dragging");
    setSettling(true);
    setSettlingClass(true);
    setOpen(next === "reply");
    paintCloseTy(live);
    if (Math.abs(live - targetTy) < 2) {
      setSettling(false);
      setSettlingClass(false);
      setSheet(next);
      clearMotionSnap(next);
      clearCloseTranslate(next);
      closeSettleRef.current = next === "out";
      drag.current.mode = null;
      return;
    }
    const settleStarted = performance.now();
    const settleDurationMs = 380;
    const startTy = live;
    let tyLive = startTy;
    window.requestAnimationFrame(() => {
      const tick = () => {
        const remaining = targetTy - tyLive;
        if (Math.abs(remaining) <= 2) {
          tyLive = targetTy;
          paintCloseTy(tyLive);
          settleFrameRef.current = 0;
          setSettling(false);
          setSettlingClass(false);
          setSheet(next);
          clearMotionSnap(next);
          clearCloseTranslate(next);
          closeSettleRef.current = next === "out";
          drag.current.mode = null;
          return;
        }
        const step = Math.sign(remaining) * Math.min(4, Math.abs(remaining));
        tyLive += step;
        paintCloseTy(tyLive);
        settleFrameRef.current = window.requestAnimationFrame(tick);
      };
      settleFrameRef.current = window.requestAnimationFrame(tick);
    });
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
    const card = cardRef.current;
    const startH =
      card?.getBoundingClientRect().height ?? heightForSnap(normalized, card);
    const closeMax = lockCloseOffset();
    const startTy =
      card instanceof HTMLElement ? readCloseTyPx(card) : normalized === "out" ? closeMax : 0;
    lockMotionHeights();
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
      mode: normalized === "out" ? "close" : null,
      startTy,
      closeMax,
      liveTy: startTy,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!pending) {
      setDragging(true);
      setDraggingClass(true);
      if (drag.current.mode === "close") {
        paintCloseTy(startTy);
      } else {
        prepareThreadForSheetMotion(normalized);
        paintMotion(startH);
      }
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
    // Handle owns sheet motion immediately (incl. close from maxScroll pin). Body keeps
    // pending slop so thread scroll wins until edges / handle.
    if (sheet === "out") {
      const max = lockCloseOffset();
      setSheet("reply");
      setOpen(true);
      paintCloseTy(max);
      drag.current = {
        y: event.clientY,
        on: true,
        pending: false,
        from: "reply",
        startH:
          cardRef.current?.getBoundingClientRect().height ??
          heightForSnap("reply", cardRef.current),
        moved: false,
        samples: [{ t: performance.now(), y: event.clientY }],
        gesture: null,
        liveH: 0,
        mode: "close",
        startTy: max,
        closeMax: max,
        liveTy: max,
      };
      setDragging(true);
      setDraggingClass(true);
      cardRef.current?.classList.add("is-dragging");
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (sheet === "reply" && fromHandle) {
      beginDrag(event, "reply", false);
      drag.current.mode = "close";
      drag.current.on = true;
      setDragging(true);
      setDraggingClass(true);
      cardRef.current?.classList.add("is-dragging");
      const card = cardRef.current;
      if (card) {
        card.removeAttribute("data-motion-live");
        card.style.removeProperty("--sheet-h");
      }
      paintCloseTy(drag.current.startTy);
      return;
    }
    beginDrag(
      event,
      sheet,
      !fromHandle && (sheet === "reply" || sheet === "full"),
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

  function activateDrag(event: ReactPointerEvent<HTMLElement>, mode: "height" | "close") {
    drag.current.on = true;
    drag.current.pending = false;
    drag.current.moved = true;
    drag.current.mode = mode;
    lockMotionHeights();
    setDragging(true);
    setDraggingClass(true);
    if (mode === "close") {
      paintCloseTy(drag.current.startTy);
    } else {
      prepareThreadForSheetMotion(drag.current.from);
      paintMotion(drag.current.startH);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCardPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending) {
      const dy = event.clientY - drag.current.y;
      const from = drag.current.from;
      if (from === "reply") {
        if (Math.abs(dy) > DRAG_SLOP) {
          activateDrag(event, dy > 0 ? "close" : "height");
        } else {
          return;
        }
      } else if (from === "full") {
        const body = cardRef.current?.querySelector(scrollBodySelector);
        const atTop = body instanceof HTMLElement ? body.scrollTop <= 1 : true;
        if (dy > DRAG_SLOP && atTop) {
          activateDrag(event, "height");
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
    if (drag.current.mode === "close") {
      if (
        dy < -DRAG_SLOP &&
        drag.current.from === "reply" &&
        drag.current.startTy <= 2
      ) {
        drag.current.mode = "height";
        drag.current.gesture = "expanding";
        prepareThreadForSheetMotion("reply");
        paintMotion(drag.current.startH);
        paintDrag(dy);
        return;
      }
      paintCloseTy(drag.current.startTy + dy);
      return;
    }
    if (dy > DRAG_SLOP) {
      if (drag.current.gesture !== "collapsing") {
        cardRef.current?.classList.add("is-dragging");
        resetThreadScrollForMotion(drag.current.from);
      }
      drag.current.gesture = "collapsing";
    } else if (dy < -DRAG_SLOP) {
      drag.current.gesture = "expanding";
    }
    paintDrag(dy);
  }

  function settleTo(next: ConversationSheetSnap) {
    if (next === "out") {
      settleCloseTo("out");
      return;
    }
    cancelSettleAnimation();
    drag.current.on = false;
    drag.current.pending = false;
    drag.current.moved = false;
    if (next === "peek") {
      next = "reply";
    }
    if (next === "reply" || next === "full") {
      // Roll-up/down keeps the latest row glued above the composer unless the user
      // scrolls history while already at full (scroll handler clears the dock).
      setThreadDockedState(true);
    }
    steppedAtRef.current = performance.now();
    const target = heightForSnap(next, cardRef.current);
    const live =
      drag.current.liveH > 0
        ? drag.current.liveH
        : cardRef.current?.getBoundingClientRect().height ?? target;
    const settleGesture: ConversationSheetGesture | null =
      target < live - 2 ? "collapsing" : target > live + 2 ? "expanding" : null;
    lockMotionHeights();
    setDragging(false);
    setDraggingClass(false);
    cardRef.current?.classList.remove("is-dragging");
    setSettling(true);
    setSettlingClass(true);
    if (settleGesture === "collapsing") {
      resetThreadScrollForMotion(sheet === "full" ? "full" : drag.current.from);
    } else if (settleGesture === "expanding") {
      resetThreadScrollForMotion("reply");
    }
    setOpen(true);
    paintMotion(live, settleGesture);
    setSheet(next);
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
    const { peekH, replyH, fullH } = heightsForMotion();
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
    if (drag.current.mode === "close") {
      const velocity = liveVelocity();
      const max = drag.current.closeMax || lockCloseOffset();
      const ty = drag.current.liveTy;
      const mid = max / 2;
      if (Math.abs(dy) < 28 && Math.abs(velocity) < 0.3) {
        settleCloseTo(ty < mid ? "reply" : "out");
        return;
      }
      if (velocity > 0.35 || ty > mid + 12) {
        settleCloseTo("out");
        return;
      }
      if (velocity < -0.35 || ty < mid - 12) {
        settleCloseTo("reply");
        return;
      }
      settleCloseTo(ty >= mid ? "out" : "reply");
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
    if (sheet === "out") {
      settleCloseTo("reply");
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
    if (sheet === "out") {
      settleCloseTo("reply");
      return;
    }
    settleTo(stepToward(sheet, "up"));
  }

  const threadScrollLocked =
    sheet === "out" ||
    closeSettleRef.current ||
    (dragging && drag.current.mode === "close") ||
    Boolean(cardRef.current?.hasAttribute("data-close-translate"));

  return {
    sheet,
    displaySnap,
    motionPhaseA: motionPhases.phaseA,
    motionPhaseB: motionPhases.phaseB,
    settling,
    dragging,
    threadScrollLocked,
    setSheet,
    dismiss,
    hide,
    expand,
    collapseToPeek,
    closeViaTranslate,
    toggleHandle,
    dragMoved: () => drag.current.moved,
    threadDocked,
    pointerHandlers: {
      onPointerDownCapture: onCardPointerDown,
      onPointerMove: onCardPointerMove,
      onPointerUp: onCardPointerUp,
      onPointerCancel: onCardPointerUp,
    },
  };
}
