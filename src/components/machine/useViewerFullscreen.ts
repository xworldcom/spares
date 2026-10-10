"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function isEmbedded() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

function isIos() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

function preferNativeFullscreen() {
  if (typeof window === "undefined") {
    return false;
  }
  if (isEmbedded() || isIos()) {
    return false;
  }
  return true;
}

export function useViewerFullscreen() {
  const chromeRef = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState(false);
  const [native, setNative] = useState(false);

  const exit = useCallback(() => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    setOverlay(false);
    setNative(false);
  }, []);

  const enter = useCallback(() => {
    const node = chromeRef.current;
    if (node && preferNativeFullscreen() && node.requestFullscreen) {
      void node
        .requestFullscreen()
        .then(() => {
          setNative(true);
          setOverlay(false);
        })
        .catch(() => {
          setOverlay(true);
          setNative(false);
        });
      return;
    }
    setOverlay(true);
    setNative(false);
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        setNative(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        exit();
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKey);
    };
  }, [exit]);

  return {
    chromeRef,
    fullscreen: overlay || native,
    overlay,
    enter,
    exit,
    toggle: overlay || native ? exit : enter,
  };
}
