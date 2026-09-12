"use client";

import { useSyncExternalStore } from "react";

/** Wide layout: side quote dock (customer) and resizable staff split. Width-only so typical desktop viewports qualify. */
export const DESKTOP_STAGE = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_STAGE);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(DESKTOP_STAGE).matches;
}

function getServerSnapshot() {
  return false;
}

export function useDesktopStage() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
