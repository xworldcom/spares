"use client";

import { useLayoutEffect, useRef, useState } from "react";

const SRC = "/landing/oee360-stage.mp4";
const POSTER = "/landing/oee360-stage.jpg";

/** Attributes iOS Safari expects before `play()` (in addition to React props). */
function applyInlineAutoplayAttrs(video: HTMLVideoElement) {
  video.defaultMuted = true;
  video.muted = true;
  video.playsInline = true;
  video.controls = false;
  video.disablePictureInPicture = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
}

export function LandingStage({ onReady }: { onReady?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    applyInlineAutoplayAttrs(video);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      video.pause();
      setOn(true);
      onReady?.();
      return;
    }

    let visible = false;
    const reveal = () => {
      if (visible) {
        return;
      }
      visible = true;
      setOn(true);
      onReady?.();
    };

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0;
    const MAX_RETRIES = 12;

    const clearRetry = () => {
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };

    const scheduleRetry = () => {
      if (retryCount >= MAX_RETRIES) {
        // Poster / first frame only — e.g. iOS Low Power Mode blocks autoplay.
        reveal();
        return;
      }
      retryCount += 1;
      clearRetry();
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        tryPlay();
      }, Math.min(400, 80 + retryCount * 40));
    };

    const tryPlay = () => {
      applyInlineAutoplayAttrs(video);
      const attempt = video.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(() => {
          scheduleRetry();
        });
      }
    };

    const onPlaying = () => {
      clearRetry();
      reveal();
    };

    const onDecodeReady = () => {
      tryPlay();
    };

    const onVisibility = () => {
      if (document.hidden) {
        clearRetry();
        video.pause();
        return;
      }
      retryCount = 0;
      tryPlay();
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("loadedmetadata", onDecodeReady);
    video.addEventListener("loadeddata", onDecodeReady);
    video.addEventListener("canplay", onDecodeReady);

    document.addEventListener("visibilitychange", onVisibility);

    tryPlay();

    const posterFallback = window.setTimeout(reveal, 2200);

    return () => {
      clearRetry();
      window.clearTimeout(posterFallback);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadedmetadata", onDecodeReady);
      video.removeEventListener("loadeddata", onDecodeReady);
      video.removeEventListener("canplay", onDecodeReady);
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
