"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DEMO_LANDING_RAIL_GO_HERO_EVENT,
  demoLandingBackToTopShown,
  demoLandingQuoteTrayOpen,
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

function readBackToTopInput(): DemoLandingBackToTopInput | null {
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
    footerInView: false,
    pinPhase: pin?.dataset.pin ?? null,
    scrubProgress: progress,
    quoteStatus: scrub?.dataset.activeQuoteStatus ?? null,
    stopRail: scrub?.dataset.landingStopRail ?? null,
    hotspotSelectUi,
  };
}

function readQuoteTraySheetHeight(): number {
  const sheet = document.querySelector<HTMLElement>(".landing-workflow-quote-sheet");
  if (!sheet) {
    return 0;
  }
  return sheet.getBoundingClientRect().height;
}

export function LandingBackToTop() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [trayHides, setTrayHides] = useState(false);
  const interactive = visible && !trayHides;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduceMotion(motion.matches);
    syncMotion();
    motion.addEventListener("change", syncMotion);

    const syncChrome = () => {
      const input = readBackToTopInput();
      if (input) {
        setVisible(demoLandingBackToTopShown(input));
      }
      setTrayHides(demoLandingQuoteTrayOpen(readQuoteTraySheetHeight()));
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
    if (storyRoot && storyObserver) {
      storyObserver.observe(storyRoot, {
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
    }

    return () => {
      motion.removeEventListener("change", syncMotion);
      window.removeEventListener("scroll", syncChrome);
      window.visualViewport?.removeEventListener("scroll", syncChrome);
      window.visualViewport?.removeEventListener("resize", syncChrome);
      window.removeEventListener("resize", syncChrome);
      storyObserver?.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (interactive) {
      return;
    }
    const btn = buttonRef.current;
    if (btn && document.activeElement === btn) {
      btn.blur();
    }
  }, [interactive]);

  const handleClick = useCallback(() => {
    window.dispatchEvent(new Event(DEMO_LANDING_RAIL_GO_HERO_EVENT));
    if (reduceMotion) {
      return;
    }
  }, [reduceMotion]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={interactive ? "landing-back-to-top is-visible" : "landing-back-to-top"}
      data-landing-btt-active={interactive ? "1" : undefined}
      inert={interactive ? undefined : true}
      onClick={handleClick}
      aria-label="Back to top — sign in"
      tabIndex={interactive ? 0 : -1}
    >
      <span className="landing-back-to-top-icon" aria-hidden="true">
        ↑
      </span>
      <span className="landing-back-to-top-label">Top</span>
    </button>
  );
}
