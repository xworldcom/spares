"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DEMO_QUOTE_DURATION_MS,
  DEMO_SCRUB_EXTRA_VH,
  DEMO_TICKET_DURATION_MS,
  demoElapsedFromProgress,
  demoSectionScrollProgress,
} from "@/lib/ui/landing-demo";

export type LandingDemoScrubSnapshot = {
  quoteElapsedMs: number;
  ticketElapsedMs: number;
  reduceMotion: boolean;
  progress: number;
};

export function LandingDemoScrub({
  children,
}: {
  children: (snapshot: LandingDemoScrubSnapshot) => ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [snapshot, setSnapshot] = useState<LandingDemoScrubSnapshot>(() => ({
    quoteElapsedMs: 0,
    ticketElapsedMs: 0,
    reduceMotion: false,
    progress: 0,
  }));

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSnapshot({
        quoteElapsedMs: DEMO_QUOTE_DURATION_MS,
        ticketElapsedMs: DEMO_TICKET_DURATION_MS,
        reduceMotion: true,
        progress: 1,
      });
      return;
    }

    const section = sectionRef.current;
    if (!section) {
      return;
    }

    let frame = 0;
    const measure = () => {
      const el = sectionRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const progress = demoSectionScrollProgress(
        rect.top,
        el.offsetHeight,
        window.innerHeight,
      );
      setSnapshot({
        quoteElapsedMs: demoElapsedFromProgress(false, progress, DEMO_QUOTE_DURATION_MS),
        ticketElapsedMs: demoElapsedFromProgress(false, progress, DEMO_TICKET_DURATION_MS),
        reduceMotion: false,
        progress,
      });
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
      aria-label="Product demos"
    >
      <div className="landing-demo-scrub-pin">{children(snapshot)}</div>
    </section>
  );
}
