"use client";

import { useCallback, useEffect, useState } from "react";

function readScrollY() {
  return (
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body?.scrollTop ||
    document.scrollingElement?.scrollTop ||
    0
  );
}

function readSparesHeaderPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--spares-header");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 56;
}

function productStoryChapterActive() {
  const story = document.getElementById("product-story");
  if (!story) {
    return false;
  }
  const scrub = story.querySelector<HTMLElement>(".landing-demo-scrub");
  const rect = story.getBoundingClientRect();
  const header = readSparesHeaderPx();
  const pinned = rect.top <= header + 2 && rect.bottom > window.innerHeight * 0.4;
  if (!pinned) {
    return false;
  }
  const progress = scrub ? Number.parseFloat(scrub.dataset.progress ?? "0") : 0;
  return progress > 0.03 && progress < 0.995;
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

export function LandingBackToTop() {
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduceMotion(motion.matches);
    syncMotion();
    motion.addEventListener("change", syncMotion);

    const syncVisible = () => {
      const threshold = Math.max(320, window.innerHeight * 0.45);
      const scrolled = readScrollY() > threshold;
      const hideForStory = productStoryChapterActive();
      setVisible(scrolled && !hideForStory);
    };
    syncVisible();
    window.addEventListener("scroll", syncVisible, { passive: true });
    window.visualViewport?.addEventListener("scroll", syncVisible);
    window.visualViewport?.addEventListener("resize", syncVisible);
    return () => {
      motion.removeEventListener("change", syncMotion);
      window.removeEventListener("scroll", syncVisible);
      window.visualViewport?.removeEventListener("scroll", syncVisible);
      window.visualViewport?.removeEventListener("resize", syncVisible);
    };
  }, []);

  const handleClick = useCallback(() => {
    scrollPageToTop(reduceMotion);
  }, [reduceMotion]);

  return (
    <button
      type="button"
      className={visible ? "landing-back-to-top is-visible" : "landing-back-to-top"}
      onClick={handleClick}
      aria-label="Back to top — sign in"
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : true}
    >
      <span className="landing-back-to-top-icon" aria-hidden="true">
        ↑
      </span>
      <span className="landing-back-to-top-label">Top</span>
    </button>
  );
}
