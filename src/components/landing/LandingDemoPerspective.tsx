"use client";

import { useEffect, useState } from "react";
import {
  DEMO_QUOTE_DURATION_MS,
  demoClockElapsed,
  type MarketingPerspective,
} from "@/lib/ui/landing-demo";

export function useLandingDemoClock(perspective: MarketingPerspective) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduceMotion(reduce);
    if (reduce) {
      setElapsedMs(DEMO_QUOTE_DURATION_MS);
      return;
    }

    const started = performance.now();
    const id = window.setInterval(() => {
      setElapsedMs(performance.now() - started);
    }, 90);
    return () => window.clearInterval(id);
  }, [perspective]);

  return { elapsedMs, reduceMotion };
}

export function LandingDemoPerspective({
  perspective,
  onPerspectiveChange,
}: {
  perspective: MarketingPerspective;
  onPerspectiveChange: (next: MarketingPerspective) => void;
}) {
  return (
    <div className="landing-perspective" role="tablist" aria-label="Viewer">
      <button
        type="button"
        role="tab"
        aria-selected={perspective === "customer"}
        className={
          perspective === "customer" ? "landing-perspective-btn is-on" : "landing-perspective-btn"
        }
        onClick={() => onPerspectiveChange("customer")}
      >
        Customer
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={perspective === "staff"}
        className={
          perspective === "staff" ? "landing-perspective-btn is-on" : "landing-perspective-btn"
        }
        onClick={() => onPerspectiveChange("staff")}
      >
        Staff (OEM)
      </button>
    </div>
  );
}
