"use client";

export function LandingScrollPeek() {
  return (
    <a className="landing-scroll-peek" href="#product-story">
      <span className="landing-scroll-peek-label">Scroll for more</span>
      <span className="landing-scroll-peek-chevron" aria-hidden="true">
        ↓
      </span>
    </a>
  );
}
