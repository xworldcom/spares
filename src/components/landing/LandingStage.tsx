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
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
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
      onReadyRef.current?.();
      return;
    }

    let visible = false;
    const reveal = () => {
      if (visible) {
        return;
      }
      visible = true;
      setOn(true);
      onReadyRef.current?.();
    };

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0;
    const MAX_RETRIES = 16;
    let playPending = false;

    const clearRetry = () => {
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };

    const scheduleRetry = () => {
      if (retryCount >= MAX_RETRIES) {
        reveal();
        return;
      }
      retryCount += 1;
      clearRetry();
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        tryPlay();
      }, Math.min(500, 80 + retryCount * 45));
    };

    const onGesture = () => {
      retryCount = 0;
      tryPlay();
    };

    const gestureOpts: AddEventListenerOptions = { capture: true };
    const touchOpts: AddEventListenerOptions = { ...gestureOpts, passive: true };
    document.addEventListener("touchstart", onGesture, touchOpts);
    document.addEventListener("pointerdown", onGesture, gestureOpts);
    document.addEventListener("click", onGesture, gestureOpts);

    const stopGestureUnlock = () => {
      document.removeEventListener("touchstart", onGesture, touchOpts);
      document.removeEventListener("pointerdown", onGesture, gestureOpts);
      document.removeEventListener("click", onGesture, gestureOpts);
    };

    const markPlaying = () => {
      clearRetry();
      stopGestureUnlock();
      reveal();
    };

    const tryPlay = () => {
      if (playPending) {
        return;
      }
      applyInlineAutoplayAttrs(video);
      if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        markPlaying();
        return;
      }
      playPending = true;
      const attempt = video.play();
      if (attempt && typeof attempt.then === "function") {
        attempt
          .then(() => {
            playPending = false;
            markPlaying();
          })
          .catch(() => {
            playPending = false;
            if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
              video.load();
            }
            scheduleRetry();
          });
      } else {
        playPending = false;
      }
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

    const onPageShow = () => {
      if (document.hidden) {
        return;
      }
      retryCount = 0;
      tryPlay();
    };

    const onPlaybackStall = () => {
      if (document.hidden || video.paused) {
        return;
      }
      scheduleRetry();
    };

    video.addEventListener("playing", markPlaying);
    video.addEventListener("loadedmetadata", onDecodeReady);
    video.addEventListener("loadeddata", onDecodeReady);
    video.addEventListener("canplay", onDecodeReady);
    video.addEventListener("canplaythrough", onDecodeReady);
    video.addEventListener("stalled", onPlaybackStall);
    video.addEventListener("suspend", onPlaybackStall);
    video.addEventListener("waiting", onPlaybackStall);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);

    tryPlay();

    const posterFallback = window.setTimeout(reveal, 2200);

    return () => {
      clearRetry();
      stopGestureUnlock();
      window.clearTimeout(posterFallback);
      video.removeEventListener("playing", markPlaying);
      video.removeEventListener("loadedmetadata", onDecodeReady);
      video.removeEventListener("loadeddata", onDecodeReady);
      video.removeEventListener("canplay", onDecodeReady);
      video.removeEventListener("canplaythrough", onDecodeReady);
      video.removeEventListener("stalled", onPlaybackStall);
      video.removeEventListener("suspend", onPlaybackStall);
      video.removeEventListener("waiting", onPlaybackStall);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return (
    <div className="landing-stage landing-stage--ambient" aria-hidden="true">
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
