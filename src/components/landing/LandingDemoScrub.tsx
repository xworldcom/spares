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

function readStickyTop(pin: HTMLElement) {
  const top = Number.parseFloat(window.getComputedStyle(pin).top);
  return Number.isFinite(top) ? top : 0;
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

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSnapshot({ progress: 1, reduceMotion: true });
      return;
    }

    let frame = 0;
    let watching = false;

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

    const loop = () => {
      measure();
      frame = watching ? window.requestAnimationFrame(loop) : 0;
    };

    const start = () => {
      if (watching) {
        return;
      }
      watching = true;
      if (!frame) {
        frame = window.requestAnimationFrame(loop);
      }
    };

    const stop = () => {
      watching = false;
    };

    const section = sectionRef.current;
    if (!section) {
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          start();
          return;
        }
        stop();
        measure();
      },
      { rootMargin: "25% 0px" },
    );
    io.observe(section);
    window.addEventListener("scroll", start, { passive: true, capture: true });
    window.addEventListener("resize", start, { passive: true });
    measure();

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("scroll", start, { capture: true });
      window.removeEventListener("resize", start);
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
          : ({ "--landing-demo-scrub-extra": `${DEMO_SCRUB_EXTRA_VH}vh` } as CSSProperties)
      }
      aria-label={ariaLabel}
    >
      <div ref={pinRef} className="landing-demo-scrub-pin">
        <div className="landing-demo-scrub-meter" aria-hidden="true">
          <i style={{ transform: `scaleX(${snapshot.progress})` }} />
        </div>
        {children(snapshot)}
      </div>
    </section>
  );
}
