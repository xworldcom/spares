"use client";

import type { MarketingPerspective } from "@/lib/ui/landing-demo";

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
