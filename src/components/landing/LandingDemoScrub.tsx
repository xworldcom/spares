"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createDemoScrubStore,
  demoApplyAtVisibility,
  demoFindScrollRoot,
  demoOffsetInDocument,
  demoParkedNestedRoot,
  demoPickScrollY,
  demoPinPlacement,
  demoPlayhead,
  demoScrubDebugEnabled,
  demoWindowScrollY,
  demoBeatTrackScrubLinear,
  demoBeatTrackIndexFromScroll,
  demoResolveHandoffQuoteStatus,
  demoThreadPlayheadAtBeatRest,
  demoWorkflowThreadPlayhead,
  reduceDemoFrame,
  workflowHandoffBeatStatuses,
  workflowHandoffBeatStatusAtIndex,
  workflowHandoffLinearStart,
  demoHandoffLinearProgressAtBeatRest,
  demoBeatTrackSnapAlignmentDeltaDirected,
  demoBeatTrackAlignIndexFromScroll,
  demoInBeatSnapChapter,
  demoShouldRunBeatAlignOnScrollEnd,
  demoBeatKeyboardStepTargetIndex,
  demoBeatAlignIndexRespectsDirection,
  type DemoBeatScrollInputKind,
  workflowScrubPreHandoffSnapRenderDeltas,
} from "@/lib/ui/landing-demo";

const HANDOFF_BEAT_STATUSES = workflowHandoffBeatStatuses();
const SCRUB_SNAP_DELTAS = workflowScrubPreHandoffSnapRenderDeltas();

export type LandingDemoScrubSnapshot = {
  progress: number;
  reduceMotion: boolean;
};

function readStickyTop(pin: HTMLElement) {
  const top = Number.parseFloat(window.getComputedStyle(pin).top);
  return Number.isFinite(top) ? top : 0;
}

function readWindowScrollY() {
  return demoWindowScrollY(
    window.pageYOffset || 0,
    document.documentElement.scrollTop || 0,
    document.body?.scrollTop || 0,
    document.scrollingElement?.scrollTop || 0,
  );
}

function readVisualPageTop() {
  return window.visualViewport?.pageTop ?? 0;
}

function findPageScrollRoot(from: HTMLElement) {
  return demoFindScrollRoot(
    from,
    (node) => {
      const parent = node.parentElement;
      if (!parent || parent === document.documentElement || parent === document.body) {
        return null;
      }
      return parent;
    },
    (node) => {
      const style = window.getComputedStyle(node);
      return {
        overflowY: style.overflowY,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      };
    },
  );
}

function applyPin(
  pin: HTMLElement,
  placement: ReturnType<typeof demoPinPlacement>,
  section: HTMLElement,
  scrollX: number,
) {
  pin.dataset.pin = placement.phase;
  pin.style.position = placement.position;
  pin.style.top = `${placement.top}px`;
  if (placement.position === "fixed") {
    const { x } = demoOffsetInDocument(section);
    pin.style.left = `${x - scrollX}px`;
    pin.style.width = `${section.offsetWidth}px`;
    pin.style.right = "auto";
  } else {
    pin.style.left = "0";
    pin.style.width = "100%";
    pin.style.right = "auto";
  }
}

function writeDebug(
  hud: HTMLElement | null,
  lines: readonly (readonly [string, string | number | boolean])[],
) {
  if (!hud) {
    return;
  }
  hud.textContent = lines.map(([key, value]) => `${key} ${value}`).join("\n");
}

export function LandingDemoScrub({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: (snapshot: LandingDemoScrubSnapshot) => ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [store] = useState(createDemoScrubStore);
  const snapshot = useSyncExternalStore(store.subscribe, store.get, store.getServer);
  const [sdaMeter, setSdaMeter] = useState(false);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    if (!section || !pin) {
      return;
    }

    section.setAttribute("data-hydrated", "1");
    const debug = demoScrubDebugEnabled(window.location.hostname, window.location.search);
    let hud: HTMLPreElement | null = null;
    if (debug) {
      hud = document.createElement("pre");
      hud.className = "landing-demo-scrub-debug";
      hud.setAttribute("aria-hidden", "true");
      section.appendChild(hud);
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      store.set({ progress: 1, reduceMotion: true });
      section.dataset.progress = "1.000";
      demoApplyAtVisibility(section.querySelectorAll<HTMLElement>("[data-demo-at]"), 1);
      writeDebug(hud, [
        ["hydrated", 1],
        ["reduceMotion", 1],
        ["progress", "1.000"],
      ]);
      return () => {
        hud?.remove();
      };
    }

    setSdaMeter(
      typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()"),
    );

    const layout = {
      sectionTop: 0,
      sectionHeight: 0,
      pinHeight: 0,
      stickyTop: 0,
    };
    let frame = 0;
    let lastY = Number.NaN;
    let running = true;

    const measureStickyTop = () => {
      const position = pin.style.position;
      const top = pin.style.top;
      const left = pin.style.left;
      const width = pin.style.width;
      pin.style.position = "";
      pin.style.top = "";
      pin.style.left = "";
      pin.style.width = "";
      layout.stickyTop = readStickyTop(pin);
      pin.style.position = position;
      pin.style.top = top;
      pin.style.left = left;
      pin.style.width = width;
    };

    const measureLayout = () => {
      const origin = demoOffsetInDocument(section);
      layout.sectionTop = origin.y;
      layout.sectionHeight = section.offsetHeight;
      layout.pinHeight = pin.offsetHeight;
    };

    const apply = () => {
      measureLayout();
      const root = findPageScrollRoot(section);
      const windowY = readWindowScrollY();
      const rootY = root?.scrollTop ?? 0;
      const visualPageTop = readVisualPageTop();
      const parkedRoot = Boolean(root) && demoParkedNestedRoot(windowY, rootY, visualPageTop);
      const scrollY = parkedRoot || !root
        ? demoPickScrollY(windowY, 0, visualPageTop)
        : Math.max(0, rootY);
      const sectionTop = root && !parkedRoot
        ? layout.sectionTop - demoOffsetInDocument(root).y
        : layout.sectionTop;
      const preSnaps = section.querySelectorAll<HTMLElement>(".landing-demo-scrub-snap");
      let preHandoffHeight = 0;
      for (const el of preSnaps) {
        preHandoffHeight += el.offsetHeight;
      }
      const beatTracks = [...section.querySelectorAll<HTMLElement>(".landing-demo-beat-track")];
      const beatTrackHeight = beatTracks[0]?.offsetHeight ?? 0;
      const beatCount = beatTracks.length;
      const sectionViewportTop = section.getBoundingClientRect().top;
      const scrolled = layout.stickyTop - sectionViewportTop;
      const scrollable = layout.sectionHeight - layout.pinHeight;
      const handoffLinearStart = workflowHandoffLinearStart();
      let linearProgress = demoBeatTrackScrubLinear(
        scrolled,
        scrollable,
        preHandoffHeight,
        beatTrackHeight,
        beatCount,
        handoffLinearStart,
      );
      const beatTrackIndex = demoBeatTrackIndexFromScroll(
        scrolled,
        preHandoffHeight,
        beatTrackHeight,
        beatCount,
      );
      const inBeatChapter = beatCount > 0 && scrolled > preHandoffHeight + 8;
      if (inBeatChapter) {
        linearProgress = demoHandoffLinearProgressAtBeatRest(beatTrackIndex);
      }
      const next = demoPlayhead(false, linearProgress);
      applyPin(
        pin,
        demoPinPlacement(
          scrollY,
          sectionTop,
          layout.sectionHeight,
          layout.pinHeight,
          layout.stickyTop,
          parkedRoot || !root,
        ),
        section,
        window.pageXOffset || 0,
      );
      section.dataset.progress = next.toFixed(3);
      const statusFromTrack = beatTracks[beatTrackIndex]?.dataset.quoteStatus;
      const quoteStatus = inBeatChapter
        ? ((statusFromTrack as (typeof HANDOFF_BEAT_STATUSES)[number]) ??
          workflowHandoffBeatStatusAtIndex(beatTrackIndex))
        : demoResolveHandoffQuoteStatus(beatTrackIndex, false, next);
      const threadPlayhead = inBeatChapter
        ? demoThreadPlayheadAtBeatRest(beatTrackIndex)
        : demoWorkflowThreadPlayhead(next);
      section.dataset.activeQuoteStatus = quoteStatus;
      demoApplyAtVisibility(
        section.querySelectorAll<HTMLElement>("[data-demo-at]"),
        threadPlayhead,
      );
      store.set({ progress: next, reduceMotion: false });
      writeDebug(hud, [
        ["hydrated", 1],
        ["windowY", Math.round(windowY)],
        ["rootY", Math.round(rootY)],
        ["pageTop", Math.round(visualPageTop)],
        ["pickY", Math.round(scrollY)],
        ["progress", next.toFixed(3)],
        ["root", root?.tagName.toLowerCase() ?? "document"],
        ["pin", pin.dataset.pin ?? ""],
        ["reduceMotion", 0],
      ]);
    };

    const tick = () => {
      if (!running) {
        return;
      }
      if (document.hidden) {
        frame = 0;
        return;
      }
      const root = findPageScrollRoot(section);
      const windowY = readWindowScrollY();
      const rootY = root?.scrollTop ?? 0;
      const visualPageTop = readVisualPageTop();
      const parkedRoot = Boolean(root) && demoParkedNestedRoot(windowY, rootY, visualPageTop);
      const y = parkedRoot || !root
        ? demoPickScrollY(windowY, 0, visualPageTop)
        : Math.max(0, rootY);
      if (y !== lastY) {
        lastY = y;
        apply();
      }
      frame = window.requestAnimationFrame(tick);
    };

    const onResize = () => {
      measureStickyTop();
      lastY = Number.NaN;
    };

    const onVisibility = () => {
      if (document.hidden || frame) {
        return;
      }
      lastY = Number.NaN;
      frame = window.requestAnimationFrame(tick);
    };

    let snapFrame = 0;
    let snapInFlight = false;
    let lastUserScrollDir: -1 | 0 | 1 = 0;
    let lastInputKind: DemoBeatScrollInputKind = "none";
    let skipNextScrollEndAlign = false;
    let touchStartClientY = 0;
    let touchLastClientY = 0;
    let touchNetFingerDelta = 0;

    const readBeatLayout = () => {
      measureLayout();
      const preSnaps = section.querySelectorAll<HTMLElement>(".landing-demo-scrub-snap");
      let preHandoffHeight = 0;
      for (const el of preSnaps) {
        preHandoffHeight += el.offsetHeight;
      }
      const beatTracks = [...section.querySelectorAll<HTMLElement>(".landing-demo-beat-track")];
      const beatTrackHeight = beatTracks[0]?.offsetHeight ?? 0;
      const beatCount = beatTracks.length;
      const sectionViewportTop = section.getBoundingClientRect().top;
      const scrolled = layout.stickyTop - sectionViewportTop;
      const inBeatChapter = beatCount > 0 && scrolled > preHandoffHeight + 8;
      return {
        preHandoffHeight,
        beatTracks,
        beatTrackHeight,
        beatCount,
        scrolled,
        inBeatChapter,
      };
    };

    const scrollByBeatDelta = (delta: number) => {
      if (Math.abs(delta) < 0.5) {
        return;
      }
      const root = findPageScrollRoot(section);
      const windowY = readWindowScrollY();
      const rootY = root?.scrollTop ?? 0;
      const visualPageTop = readVisualPageTop();
      const parkedRoot = Boolean(root) && demoParkedNestedRoot(windowY, rootY, visualPageTop);
      const scrollY = parkedRoot || !root
        ? demoPickScrollY(windowY, 0, visualPageTop)
        : Math.max(0, rootY);
      lastUserScrollDir = delta > 0 ? 1 : -1;
      skipNextScrollEndAlign = true;
      window.scrollTo({ top: Math.max(0, scrollY + delta), left: 0, behavior: "auto" });
      if (root && !parkedRoot) {
        root.scrollTop = Math.max(0, root.scrollTop + delta);
      }
      lastY = Number.NaN;
      apply();
    };

    const scrollToBeatIndex = (beatTracks: HTMLElement[], index: number) => {
      const track = beatTracks[index];
      if (!track) {
        return;
      }
      const delta = demoBeatTrackSnapAlignmentDeltaDirected(
        track.getBoundingClientRect().top,
        layout.stickyTop,
        0,
        20,
      );
      if (delta === null) {
        return;
      }
      scrollByBeatDelta(delta);
    };

    const alignBeatSnap = () => {
      if (snapInFlight || document.hidden || skipNextScrollEndAlign) {
        skipNextScrollEndAlign = false;
        return;
      }
      if (!demoShouldRunBeatAlignOnScrollEnd(lastInputKind)) {
        return;
      }
      const {
        preHandoffHeight,
        beatTracks,
        beatTrackHeight,
        beatCount,
        scrolled,
      } = readBeatLayout();
      if (!demoInBeatSnapChapter(scrolled, preHandoffHeight, beatTrackHeight, beatCount)) {
        return;
      }
      const settledIndex = demoBeatTrackIndexFromScroll(
        scrolled,
        preHandoffHeight,
        beatTrackHeight,
        beatCount,
      );
      let scrollDir = lastUserScrollDir;
      if (scrollDir === 0 && lastInputKind === "touch" && Math.abs(touchNetFingerDelta) >= 4) {
        scrollDir = touchNetFingerDelta < 0 ? 1 : -1;
      }
      if (scrollDir > 0 && settledIndex >= beatCount - 1) {
        return;
      }
      if (scrollDir < 0 && settledIndex <= 0) {
        return;
      }
      const beatTrackIndex = demoBeatTrackAlignIndexFromScroll(
        scrolled,
        preHandoffHeight,
        beatTrackHeight,
        beatCount,
        scrollDir,
      );
      if (!demoBeatAlignIndexRespectsDirection(settledIndex, beatTrackIndex, scrollDir)) {
        return;
      }
      if (scrollDir > 0 && beatTrackIndex >= beatCount - 1) {
        return;
      }
      if (scrollDir < 0 && beatTrackIndex <= 0) {
        return;
      }
      const track = beatTracks[beatTrackIndex];
      if (!track) {
        return;
      }
      const delta = demoBeatTrackSnapAlignmentDeltaDirected(
        track.getBoundingClientRect().top,
        layout.stickyTop,
        scrollDir,
        20,
      );
      if (delta === null) {
        return;
      }
      snapInFlight = true;
      scrollByBeatDelta(delta);
      window.requestAnimationFrame(() => {
        snapInFlight = false;
      });
    };

    const scheduleBeatSnap = () => {
      if (snapFrame) {
        window.cancelAnimationFrame(snapFrame);
      }
      snapFrame = window.requestAnimationFrame(() => {
        snapFrame = 0;
        alignBeatSnap();
      });
    };

    const onScrollEnd = () => {
      scheduleBeatSnap();
    };

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) >= 0.5) {
        lastInputKind = "wheel";
        lastUserScrollDir = event.deltaY > 0 ? 1 : -1;
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      lastInputKind = "touch";
      touchStartClientY = event.touches[0]?.clientY ?? 0;
      touchLastClientY = touchStartClientY;
      touchNetFingerDelta = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchLastClientY;
      const step = touchLastClientY - y;
      touchNetFingerDelta += step;
      touchLastClientY = y;
      if (Math.abs(step) >= 1) {
        lastUserScrollDir = step > 0 ? 1 : -1;
      }
    };

    const onTouchEnd = () => {
      if (Math.abs(touchNetFingerDelta) >= 4) {
        lastUserScrollDir = touchNetFingerDelta < 0 ? 1 : -1;
      }
    };

    const onPointerDown = () => {
      lastInputKind = "click";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "PageDown" && event.key !== "PageUp") {
        return;
      }
      const {
        preHandoffHeight,
        beatTracks,
        beatTrackHeight,
        beatCount,
        scrolled,
        inBeatChapter,
      } = readBeatLayout();
      const activeStatus = section.dataset.activeQuoteStatus ?? "";
      const statusIndex = HANDOFF_BEAT_STATUSES.indexOf(
        activeStatus as (typeof HANDOFF_BEAT_STATUSES)[number],
      );
      const onHandoffBeat =
        beatCount > 0 && (inBeatChapter || (statusIndex >= 0 && statusIndex < beatCount));
      if (!onHandoffBeat) {
        return;
      }
      const direction = event.key === "PageDown" ? 1 : -1;
      lastInputKind = "keyboard";
      lastUserScrollDir = direction;
      const currentIndex =
        statusIndex >= 0
          ? statusIndex
          : demoBeatTrackIndexFromScroll(
              scrolled,
              preHandoffHeight,
              beatTrackHeight,
              beatCount,
            );
      const targetIndex = demoBeatKeyboardStepTargetIndex(currentIndex, direction, beatCount);
      if (targetIndex === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      scrollToBeatIndex(beatTracks, targetIndex);
    };

    measureStickyTop();
    apply();
    frame = window.requestAnimationFrame(tick);

    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("scrollend", onScrollEnd, { passive: true });
    let scrollEndFallback = 0;
    const onScrollForSnap = () => {
      window.clearTimeout(scrollEndFallback);
      scrollEndFallback = window.setTimeout(onScrollEnd, 180);
    };
    const scrollEndNative = "onscrollend" in window;
    if (!scrollEndNative) {
      window.addEventListener("scroll", onScrollForSnap, { passive: true });
    }
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", onResize, { passive: true });

    return () => {
      running = false;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("scrollend", onScrollEnd);
      if (!scrollEndNative) {
        window.removeEventListener("scroll", onScrollForSnap);
      }
      window.clearTimeout(scrollEndFallback);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
      if (snapFrame) {
        window.cancelAnimationFrame(snapFrame);
      }
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      hud?.remove();
    };
  }, [store]);

  return (
    <section
      ref={sectionRef}
      className="landing-demo-scrub"
      data-reduce-motion={snapshot.reduceMotion || undefined}
      data-progress={snapshot.progress.toFixed(3)}
      aria-label={ariaLabel}
    >
      {snapshot.reduceMotion
        ? null
        : SCRUB_SNAP_DELTAS.map((marker, index) => (
            <div
              key={index}
              className={
                marker.handoffEntry
                  ? "landing-demo-scrub-snap landing-demo-scrub-snap--handoff-entry"
                  : "landing-demo-scrub-snap"
              }
              style={{
                height: `calc(${marker.heightDelta} * var(--landing-demo-scrub-extra, 1000svh))`,
              }}
              aria-hidden="true"
            >
              <span className="sr-only">{marker.label}</span>
            </div>
          ))}
      {snapshot.reduceMotion
        ? null
        : HANDOFF_BEAT_STATUSES.map((status) => (
            <div
              key={status}
              className="landing-demo-beat-track"
              data-quote-status={status}
              aria-hidden="true"
            >
              <span className="sr-only">{status}</span>
            </div>
          ))}
      <div ref={pinRef} className="landing-demo-scrub-pin">
        <div className="landing-demo-scrub-meter" aria-hidden="true">
          <i style={sdaMeter ? undefined : { transform: `scaleX(${snapshot.progress})` }} />
        </div>
        {children(snapshot)}
      </div>
    </section>
  );
}
