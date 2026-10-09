"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  demoLandingBackToTopShown,
  type DemoLandingBackToTopInput,
} from "@/lib/ui/landing-demo";

function readScrollY() {
  return (
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body?.scrollTop ||
    document.scrollingElement?.scrollTop ||
    0
  );
}

function readBackToTopInput(footerInView: boolean): DemoLandingBackToTopInput | null {
  const story = document.getElementById("product-story");
  if (!story) {
    return null;
  }
  const scrub = story.querySelector<HTMLElement>(".landing-demo-scrub");
  const pin = scrub?.querySelector<HTMLElement>(".landing-demo-scrub-pin");
  const partSheet = story.querySelector<HTMLElement>(".landing-workflow-part-sheet");
  const hotspot = story.querySelector<HTMLElement>(".landing-workflow-hotspot.is-on");
  const progress = scrub ? Number.parseFloat(scrub.dataset.progress ?? "0") : 0;
  const hotspotSelectUi =
    pin?.dataset.pin === "track" &&
    progress < 0.52 &&
    Boolean(partSheet) &&
    Boolean(hotspot) &&
    (partSheet?.getBoundingClientRect().height ?? 0) > 24;

  return {
    scrollY: readScrollY(),
    viewportHeight: window.innerHeight,
    storyViewportTop: story.getBoundingClientRect().top,
    footerInView,
    pinPhase: pin?.dataset.pin ?? null,
    scrubProgress: progress,
    quoteStatus: scrub?.dataset.activeQuoteStatus ?? null,
    stopRail: scrub?.dataset.landingStopRail ?? null,
    hotspotSelectUi,
  };
}

function scrollPageToTop(reduceMotion: boolean) {
  const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
  try {
    window.scrollTo({ top: 0, left: 0, behavior });
  } catch {
    const root = document.scrollingElement ?? document.documentElement;
    root.scrollTop = 0;
  }
}

function measureQuoteTrayBottomInset(): string | null {
  const sheet = document.querySelector<HTMLElement>(".landing-workflow-quote-sheet");
  if (!sheet) {
    return null;
  }
  const rect = sheet.getBoundingClientRect();
  if (rect.height < 12 || rect.bottom < window.innerHeight * 0.3) {
    return null;
  }
  const gap = 12;
  return `${Math.max(0, window.innerHeight - rect.top + gap)}px`;
}

export function LandingBackToTop() {
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [footerInView, setFooterInView] = useState(false);
  const [trayBottom, setTrayBottom] = useState<string | null>(null);

  useEffect(() => {
    const footer = document.querySelector(".landing-site-footer");
    if (!footer || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setFooterInView(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduceMotion(motion.matches);
    syncMotion();
    motion.addEventListener("change", syncMotion);

    const syncChrome = () => {
      const input = readBackToTopInput(footerInView);
      if (input) {
        setVisible(demoLandingBackToTopShown(input));
      }
      setTrayBottom(measureQuoteTrayBottomInset());
    };

    syncChrome();
    window.addEventListener("scroll", syncChrome, { passive: true });
    window.visualViewport?.addEventListener("scroll", syncChrome);
    window.visualViewport?.addEventListener("resize", syncChrome);
    window.addEventListener("resize", syncChrome, { passive: true });

    const storyRoot = document.getElementById("product-story");
    const storyObserver =
      storyRoot && typeof MutationObserver !== "undefined"
        ? new MutationObserver(syncChrome)
        : null;
    storyObserver?.observe(storyRoot, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        "data-progress",
        "data-active-quote-status",
        "data-landing-stop-rail",
        "data-pin",
        "class",
      ],
    });

    return () => {
      motion.removeEventListener("change", syncMotion);
      window.removeEventListener("scroll", syncChrome);
      window.visualViewport?.removeEventListener("scroll", syncChrome);
      window.visualViewport?.removeEventListener("resize", syncChrome);
      window.removeEventListener("resize", syncChrome);
      storyObserver?.disconnect();
    };
  }, [footerInView]);

  const handleClick = useCallback(() => {
    scrollPageToTop(reduceMotion);
  }, [reduceMotion]);

  const shown = visible && !footerInView;

  return (
    <button
      type="button"
      className={shown ? "landing-back-to-top is-visible" : "landing-back-to-top"}
      style={
        trayBottom
          ? ({ "--landing-btt-bottom": trayBottom } as CSSProperties)
          : undefined
      }
      onClick={handleClick}
      aria-label="Back to top — sign in"
      tabIndex={shown ? 0 : -1}
      aria-hidden={shown ? undefined : true}
    >
      <span className="landing-back-to-top-icon" aria-hidden="true">
        ↑
      </span>
      <span className="landing-back-to-top-label">Top</span>
    </button>
  );
}
