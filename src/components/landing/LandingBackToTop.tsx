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
  const pin = scrub?.querySelector<HTMLElement>(".landing-demo-scrub-pin");
  if (pin?.dataset.pin === "end") {
    return false;
  }
  if (pin?.dataset.pin === "track") {
    return true;
  }
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
  const [footerInView, setFooterInView] = useState(false);

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

    const syncVisible = () => {
      const threshold = Math.max(520, window.innerHeight * 0.92);
      const scrolled = readScrollY() > threshold;
      const story = document.getElementById("product-story");
      const storyDeep =
        story !== null &&
        story.getBoundingClientRect().top < -Math.round(window.innerHeight * 0.2);
      const hideForStory = productStoryChapterActive();
      setVisible(scrolled && storyDeep && !hideForStory);
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

  const shown = visible && !footerInView;

  return (
    <button
      type="button"
      className={shown ? "landing-back-to-top is-visible" : "landing-back-to-top"}
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
