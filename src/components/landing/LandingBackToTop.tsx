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
      setVisible(readScrollY() > threshold);
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
