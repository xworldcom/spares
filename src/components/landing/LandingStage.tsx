"use client";

import { useEffect, useRef, useState } from "react";

export function LandingStage({ onReady }: { onReady?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      video.pause();
      setOn(true);
      onReady?.();
      return;
    }
    const start = () => {
      setOn(true);
      onReady?.();
    };
    video.addEventListener("playing", start, { once: true });
    video.addEventListener("canplay", start, { once: true });
    const play = video.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => {
        start();
      });
    }
    const fallback = window.setTimeout(start, 1200);
    return () => {
      window.clearTimeout(fallback);
      video.removeEventListener("playing", start);
      video.removeEventListener("canplay", start);
    };
  }, [onReady]);

  return (
    <div className="landing-stage" aria-hidden="true">
      <video
        ref={videoRef}
        className={on ? "is-on" : undefined}
        poster="/landing/oee360-stage.jpg"
        muted
        playsInline
        loop
        autoPlay
        preload="auto"
      >
        <source src="/landing/oee360-stage.webm" type="video/webm" />
        <source src="/landing/oee360-stage.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
