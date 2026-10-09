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
  demoLandingScrollStopStepTargetIndex,
  demoLandingScrollStopsDedupe,
  demoLandingWheelCapRegion,
  type DemoBeatScrollInputKind,
  type DemoLandingScrollStop,
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
        viewportWidth(),
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
      frozenLandingStops = null;
      lastY = Number.NaN;
    };

    const onVisibility = () => {
      if (document.hidden || frame) {
        return;
      }
      lastY = Number.NaN;
      frame = window.requestAnimationFrame(tick);
    };

    let lastUserScrollDir: -1 | 0 | 1 = 0;
    let lastInputKind: DemoBeatScrollInputKind = "none";
    let programmaticScrollUntil = 0;
    let touchStartClientY = 0;
    let touchLastClientY = 0;
    let touchNetFingerDelta = 0;
    let touchStepToken = 0;
    let touchStepStartScrollY = 0;
    let wheelInertiaAcc = 0;
    let wheelIdleTimer = 0;
    const viewportWidth = () => window.innerWidth;

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

    const readPageScrollY = () => {
      const root = findPageScrollRoot(section);
      const windowY = readWindowScrollY();
      const rootY = root?.scrollTop ?? 0;
      const visualPageTop = readVisualPageTop();
      const parkedRoot = Boolean(root) && demoParkedNestedRoot(windowY, rootY, visualPageTop);
      return parkedRoot || !root
        ? demoPickScrollY(windowY, 0, visualPageTop)
        : Math.max(0, rootY);
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
      programmaticScrollUntil = performance.now() + 520;
      window.scrollTo({ top: Math.max(0, scrollY + delta), left: 0, behavior: "auto" });
      if (root && !parkedRoot) {
        root.scrollTop = Math.max(0, root.scrollTop + delta);
      }
      lastY = Number.NaN;
      apply();
    };

    const scrollToAbsoluteY = (targetY: number) => {
      const scrollY = readPageScrollY();
      scrollByBeatDelta(targetY - scrollY);
    };

    const scrollToLandingStop = (stop: DemoLandingScrollStop) => {
      if (stop.kind === "schematic") {
        document.getElementById("machine-model")?.scrollIntoView({ block: "start", behavior: "auto" });
        return;
      }
      if (stop.kind === "assembly") {
        document.getElementById("cad-ingest")?.scrollIntoView({ block: "start", behavior: "auto" });
        return;
      }
      scrollToAbsoluteY(stop.scrollY);
    };

    const scrollStopYFromLayout = (el: HTMLElement) => {
      return demoOffsetInDocument(el).y - layout.stickyTop;
    };

    let frozenLandingStops: DemoLandingScrollStop[] | null = null;

    const buildLandingScrollStops = (): DemoLandingScrollStop[] => {
      measureLayout();
      const stops: DemoLandingScrollStop[] = [{ kind: "hero", scrollY: 0 }];

      const preSnaps = section.querySelectorAll<HTMLElement>(".landing-demo-scrub-snap");
      for (const el of preSnaps) {
        stops.push({
          kind: "preHandoff",
          scrollY: scrollStopYFromLayout(el),
        });
      }

      const beatTracks = [...section.querySelectorAll<HTMLElement>(".landing-demo-beat-track")];
      beatTracks.forEach((track, beatIndex) => {
        stops.push({
          kind: "beat",
          beatIndex,
          scrollY: scrollStopYFromLayout(track),
        });
      });

      const pin = pinRef.current;
      const pinHeight = pin?.offsetHeight ?? layout.pinHeight;
      const sectionDocY = demoOffsetInDocument(section).y;
      stops.push({
        kind: "confirmedHold",
        scrollY: sectionDocY + Math.max(0, layout.sectionHeight - pinHeight) - layout.stickyTop,
      });

      const schematic = document.getElementById("machine-model");
      const assembly = document.getElementById("cad-ingest");
      const footer = document.querySelector<HTMLElement>(".landing-site-footer");
      const maxY = Math.max(
        0,
        (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight,
      );
      const clampPost = (y: number) => Math.min(Math.max(0, y), maxY);
      if (schematic) {
        stops.push({
          kind: "schematic",
          scrollY: clampPost(scrollStopYFromLayout(schematic)),
        });
      }
      if (assembly) {
        stops.push({
          kind: "assembly",
          scrollY: clampPost(scrollStopYFromLayout(assembly)),
        });
      }
      const merged = demoLandingScrollStopsDedupe(stops);
      if (footer) {
        merged.push({ kind: "footer", scrollY: maxY });
      }
      const sorted = merged.sort((a, b) => a.scrollY - b.scrollY);
      section.dataset.landingStopRail = sorted
        .map((stop) => `${stop.kind}:${Math.round(stop.scrollY)}`)
        .join("|");
      return sorted;
    };

    const collectLandingScrollStops = (): DemoLandingScrollStop[] => {
      if (!frozenLandingStops) {
        frozenLandingStops = buildLandingScrollStops();
      }
      return frozenLandingStops;
    };

    const scrubEndScrollY = () => {
      const hold = collectLandingScrollStops().find((stop) => stop.kind === "confirmedHold");
      return hold?.scrollY ?? 0;
    };

    const stepLandingScrollStop = (direction: -1 | 1, inputKind: DemoBeatScrollInputKind) => {
      const stops = collectLandingScrollStops();
      if (stops.length < 2) {
        return false;
      }
      const scrollY = readPageScrollY();
      const footerY = stops.find((s) => s.kind === "footer")?.scrollY ?? scrollY;
      if (!demoLandingWheelCapRegion(scrollY, scrubEndScrollY(), footerY)) {
        return false;
      }
      const targetIndex = demoLandingScrollStopStepTargetIndex(stops, scrollY, direction);
      if (targetIndex === null) {
        return false;
      }
      lastInputKind = inputKind;
      lastUserScrollDir = direction;
      scrollToLandingStop(stops[targetIndex]);
      return true;
    };

    const flushWheelInertiaStep = (threshold: number) => {
      if (Math.abs(wheelInertiaAcc) < threshold) {
        return false;
      }
      const direction = wheelInertiaAcc > 0 ? 1 : -1;
      wheelInertiaAcc = 0;
      stepLandingScrollStop(direction, "wheel");
      return true;
    };

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 0.5) {
        return;
      }
      const direction = event.deltaY > 0 ? 1 : -1;
      lastInputKind = "wheel";
      lastUserScrollDir = direction;
      const scrollY = readPageScrollY();
      const footerY =
        collectLandingScrollStops().find((stop) => stop.kind === "footer")?.scrollY ?? scrollY;
      if (!demoLandingWheelCapRegion(scrollY, scrubEndScrollY(), footerY)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const { beatTrackHeight } = readBeatLayout();
      const threshold = Math.max(20, beatTrackHeight / 5.5);
      wheelInertiaAcc += event.deltaY;
      window.clearTimeout(wheelIdleTimer);
      wheelIdleTimer = window.setTimeout(() => {
        if (!flushWheelInertiaStep(threshold)) {
          wheelInertiaAcc = 0;
        }
      }, 380);
      flushWheelInertiaStep(threshold);
    };

    const onTouchStart = (event: TouchEvent) => {
      lastInputKind = "touch";
      touchStepToken += 1;
      touchStartClientY = event.touches[0]?.clientY ?? 0;
      touchLastClientY = touchStartClientY;
      touchNetFingerDelta = 0;
      touchStepStartScrollY = readPageScrollY();
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
      const net = touchNetFingerDelta;
      touchNetFingerDelta = 0;
      if (Math.abs(net) < 10) {
        return;
      }
      const direction = net < 0 ? 1 : -1;
      lastUserScrollDir = direction;
      lastInputKind = "touch";
      if (viewportWidth() >= 900) {
        return;
      }
      const token = touchStepToken;
      const startY = touchStepStartScrollY;
      window.setTimeout(() => {
        if (token !== touchStepToken || performance.now() < programmaticScrollUntil) {
          return;
        }
        const settledY = readPageScrollY();
        if (direction > 0 && settledY < startY - 12) {
          return;
        }
        if (direction < 0 && settledY > startY + 12) {
          return;
        }
        const beforeStep = settledY;
        if (!stepLandingScrollStop(direction, "touch")) {
          return;
        }
        window.setTimeout(() => {
          const afterStep = readPageScrollY();
          if (direction > 0 && afterStep < beforeStep - 8) {
            scrollByBeatDelta(beforeStep - afterStep);
          }
          if (direction < 0 && afterStep > beforeStep + 8) {
            scrollByBeatDelta(beforeStep - afterStep);
          }
        }, 60);
      }, 300);
    };

    const onPointerDown = () => {
      lastInputKind = "click";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "PageDown" && event.key !== "PageUp") {
        return;
      }
      const direction = event.key === "PageDown" ? 1 : -1;
      if (!stepLandingScrollStop(direction, "keyboard")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    measureStickyTop();
    apply();
    frozenLandingStops = buildLandingScrollStops();
    frame = window.requestAnimationFrame(tick);

    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });

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
      window.visualViewport?.removeEventListener("resize", onResize);
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
