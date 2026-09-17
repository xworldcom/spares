"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
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
  for (let node: Element | null = el; node instanceof HTMLElement; node = node.offsetParent) {
    y += node.offsetTop;
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
    let running = true;

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
      measureLayout();
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
      flushSync(() => {
        setSnapshot((current) =>
          current.reduceMotion === false && current.progress === next
            ? current
            : { progress: next, reduceMotion: false },
        );
      });
    };

    const tick = () => {
      if (!running) {
        return;
      }
      if (document.hidden) {
        frame = 0;
        return;
      }
      const y = documentScrollY();
      if (y !== lastY) {
        lastY = y;
        apply();
      }
      frame = window.requestAnimationFrame(tick);
    };

    const onResize = () => {
      lastY = Number.NaN;
    };

    const onVisibility = () => {
      if (document.hidden || frame) {
        return;
      }
      lastY = Number.NaN;
      frame = window.requestAnimationFrame(tick);
    };

    apply();
    frame = window.requestAnimationFrame(tick);

    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });

    return () => {
      running = false;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
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
