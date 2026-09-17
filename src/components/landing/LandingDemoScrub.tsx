"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DEMO_SCRUB_EXTRA_SVH,
  demoDocumentScrollProgress,
  demoPlayhead,
} from "@/lib/ui/landing-demo";

export type LandingDemoScrubSnapshot = {
  progress: number;
  reduceMotion: boolean;
};

function readStickyTop(pin: HTMLElement) {
  const top = Number.parseFloat(window.getComputedStyle(pin).top);
  return Number.isFinite(top) ? top : 0;
}

function documentScrollY() {
  return Math.max(
    window.pageYOffset || 0,
    document.documentElement.scrollTop || 0,
    document.body?.scrollTop || 0,
    document.scrollingElement?.scrollTop || 0,
  );
}

function offsetTopInDocument(el: HTMLElement) {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node) {
    y += node.offsetTop;
    const parent = node.offsetParent;
    node = parent instanceof HTMLElement ? parent : null;
  }
  return y;
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

    const layout = {
      sectionTop: 0,
      sectionHeight: 0,
      pinHeight: 0,
      stickyTop: 0,
    };
    let frame = 0;
    let lastY = Number.NaN;
    let still = 0;

    const measureLayout = () => {
      const el = sectionRef.current;
      const stage = pinRef.current;
      if (!el || !stage) {
        return;
      }
      layout.sectionTop = offsetTopInDocument(el);
      layout.sectionHeight = el.offsetHeight;
      layout.pinHeight = stage.offsetHeight;
      layout.stickyTop = readStickyTop(stage);
    };

    const apply = () => {
      const next = demoPlayhead(
        false,
        demoDocumentScrollProgress(
          documentScrollY(),
          layout.sectionTop,
          layout.sectionHeight,
          layout.pinHeight,
          layout.stickyTop,
        ),
      );
      setSnapshot((current) =>
        current.reduceMotion === false && current.progress === next
          ? current
          : { progress: next, reduceMotion: false },
      );
    };

    const tick = () => {
      const y = documentScrollY();
      if (y !== lastY) {
        lastY = y;
        still = 0;
        apply();
      } else {
        still += 1;
      }
      frame = still < 24 ? window.requestAnimationFrame(tick) : 0;
    };

    const arm = () => {
      still = 0;
      if (!frame) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      measureLayout();
      arm();
    };

    measureLayout();
    apply();

    const scrollTarget = document.scrollingElement;
    window.addEventListener("scroll", arm, { passive: true, capture: true });
    document.addEventListener("scroll", arm, { passive: true, capture: true });
    scrollTarget?.addEventListener("scroll", arm, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("touchstart", arm, { passive: true });
    document.addEventListener("touchmove", arm, { passive: true });
    document.addEventListener("touchend", arm, { passive: true });
    window.visualViewport?.addEventListener("scroll", arm, { passive: true });
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });

    return () => {
      window.removeEventListener("scroll", arm, { capture: true });
      document.removeEventListener("scroll", arm, { capture: true });
      scrollTarget?.removeEventListener("scroll", arm);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("touchstart", arm);
      document.removeEventListener("touchmove", arm);
      document.removeEventListener("touchend", arm);
      window.visualViewport?.removeEventListener("scroll", arm);
      window.visualViewport?.removeEventListener("resize", onResize);
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
