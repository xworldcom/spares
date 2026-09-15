"use client";

import { useEffect, useRef, useState } from "react";

const SRC = "/landing/oee360-stage.mp4";
const POSTER = "/landing/oee360-stage.jpg";

export function LandingStage({ onReady }: { onReady?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.disablePictureInPicture = true;
    video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      video.pause();
      setOn(true);
      onReady?.();
      return;
    }

    let armed = false;
    const start = () => {
      if (armed) {
        return;
      }
      armed = true;
      setOn(true);
      onReady?.();
    };

    const tryPlay = () => {
      const play = video.play();
      if (play && typeof play.catch === "function") {
        play.catch(() => start());
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        video.pause();
        return;
      }
      tryPlay();
    };

    video.addEventListener("playing", start);
    video.addEventListener("canplay", start);
    document.addEventListener("visibilitychange", onVisibility);
    tryPlay();
    const fallback = window.setTimeout(start, 900);

    return () => {
      window.clearTimeout(fallback);
      video.removeEventListener("playing", start);
      video.removeEventListener("canplay", start);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [onReady]);

  return (
    <div className="landing-stage" aria-hidden="true">
      <video
        ref={videoRef}
        className={on ? "is-on" : undefined}
        poster={POSTER}
        src={SRC}
        muted
        playsInline
        loop
        autoPlay
        preload="auto"
        tabIndex={-1}
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}
