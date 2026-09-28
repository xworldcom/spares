"use client";

export function LandingScrollPeek() {
  return (
    <a className="landing-scroll-peek" href="#product-story">
      <span className="landing-scroll-peek-label">Parts quote</span>
      <span className="landing-scroll-peek-chevron" aria-hidden="true">
        ↓
      </span>
    </a>
  );
}
