"use client";

export function LandingScrollPeek() {
  return (
    <a className="landing-scroll-peek" href="#machine-model">
      <span className="landing-scroll-peek-label">See the model</span>
      <span className="landing-scroll-peek-chevron" aria-hidden="true">
        ↓
      </span>
    </a>
  );
}
