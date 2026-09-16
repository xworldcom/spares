"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DEMO_SCRUB_EXTRA_VH,
  demoPlayhead,
  demoSectionScrollProgress,
} from "@/lib/ui/landing-demo";

export type LandingDemoScrubSnapshot = {
  progress: number;
  reduceMotion: boolean;
};

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

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSnapshot({ progress: 1, reduceMotion: true });
      return;
    }

    const section = sectionRef.current;
    const pin = pinRef.current;
    if (!section || !pin) {
      return;
    }

    let frame = 0;
    const measure = () => {
      const el = sectionRef.current;
      const stage = pinRef.current;
      if (!el || !stage) {
        return;
      }
      const stickyTop = Number.parseFloat(window.getComputedStyle(stage).top) || 0;
      const progress = demoSectionScrollProgress(
        el.getBoundingClientRect().top,
        el.offsetHeight,
        stage.offsetHeight,
        stickyTop,
      );
      const next = demoPlayhead(false, progress);
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

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
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
      style={
        snapshot.reduceMotion
          ? undefined
          : ({ "--landing-demo-scrub-extra": `${DEMO_SCRUB_EXTRA_VH}vh` } as CSSProperties)
      }
      aria-label={ariaLabel}
    >
      <div ref={pinRef} className="landing-demo-scrub-pin">
        <div
          className="landing-demo-scrub-meter"
          aria-hidden="true"
        >
          <i style={{ transform: `scaleX(${snapshot.progress})` }} />
        </div>
        {children(snapshot)}
      </div>
    </section>
  );
}
