"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addFullscreenChangeListener,
  documentFullscreenElement,
  exitDocumentFullscreen,
  requestElementFullscreen,
} from "@/lib/ui/document-fullscreen";

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

  const clearChromeLayoutStyles = useCallback(() => {
    const node = chromeRef.current;
    if (!node) {
      return;
    }
    node.style.height = "";
    node.style.width = "";
    node.style.maxHeight = "";
  }, []);

  const exit = useCallback(() => {
    exitDocumentFullscreen();
    clearChromeLayoutStyles();
    requestAnimationFrame(() => {
      clearChromeLayoutStyles();
      window.dispatchEvent(new Event("resize"));
    });
    setOverlay(false);
    setNative(false);
  }, [clearChromeLayoutStyles]);

  const enter = useCallback(() => {
    const node = chromeRef.current;
    if (node && preferNativeFullscreen()) {
      void requestElementFullscreen(node)
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
      if (!documentFullscreenElement()) {
        clearChromeLayoutStyles();
        requestAnimationFrame(() => {
          clearChromeLayoutStyles();
          window.dispatchEvent(new Event("resize"));
        });
        setNative(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        // Overlay mode only — native fullscreen exits via the browser; never from orbit gestures.
        setOverlay(false);
      }
    }
    const removeFullscreenListener = addFullscreenChangeListener(onFullscreenChange);
    document.addEventListener("keydown", onKey);
    return () => {
      removeFullscreenListener();
      document.removeEventListener("keydown", onKey);
    };
  }, [clearChromeLayoutStyles]);

  return {
    chromeRef,
    fullscreen: overlay || native,
    overlay,
    enter,
    exit,
    toggle: overlay || native ? exit : enter,
  };
}
