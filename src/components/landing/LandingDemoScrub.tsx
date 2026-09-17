"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DEMO_SCRUB_EXTRA_SVH,
  demoPlayhead,
  demoSectionScrollProgress,
} from "@/lib/ui/landing-demo";

export type LandingDemoScrubSnapshot = {
  progress: number;
  reduceMotion: boolean;
};

function readStickyTop(pin: HTMLElement) {
  const top = Number.parseFloat(window.getComputedStyle(pin).top);
  return Number.isFinite(top) ? top : 0;
}

function supportsViewTimeline() {
  return typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()");
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
  const [snapshot, setSnapshot] = useState<LandingDemoScrubSnapshot>(() => ({
    progress: 0,
    reduceMotion: false,
  }));
  const [sdaMeter, setSdaMeter] = useState(false);

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSnapshot({ progress: 1, reduceMotion: true });
      return;
    }

    setSdaMeter(supportsViewTimeline());

    let frame = 0;

    const measure = () => {
      const el = sectionRef.current;
      const stage = pinRef.current;
      if (!el || !stage) {
        return;
      }
      const next = demoPlayhead(
        false,
        demoSectionScrollProgress(
          el.getBoundingClientRect().top,
          el.offsetHeight,
          stage.offsetHeight,
          readStickyTop(stage),
        ),
      );
      setSnapshot((current) =>
        current.reduceMotion === false && current.progress === next
          ? current
          : { progress: next, reduceMotion: false },
      );
    };

    const onScroll = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("touchmove", onScroll, { passive: true });
    window.visualViewport?.addEventListener("scroll", onScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", onScroll, { passive: true });
    measure();

    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("touchmove", onScroll);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="landing-demo-scrub"
      data-reduce-motion={snapshot.reduceMotion || undefined}
      data-progress={snapshot.progress.toFixed(3)}
      style={
        snapshot.reduceMotion
          ? undefined
          : ({ "--landing-demo-scrub-extra": `${DEMO_SCRUB_EXTRA_SVH}svh` } as CSSProperties)
      }
      aria-label={ariaLabel}
    >
      <div ref={pinRef} className="landing-demo-scrub-pin">
        <div className="landing-demo-scrub-meter" aria-hidden="true">
          <i style={sdaMeter ? undefined : { transform: `scaleX(${snapshot.progress})` }} />
        </div>
        {children(snapshot)}
      </div>
    </section>
  );
}
