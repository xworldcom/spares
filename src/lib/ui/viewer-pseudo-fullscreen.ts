import { measuredSiteHeaderBottomPx, visualViewportMetrics } from "./conversation-sheet-viewport";

/** iOS and iPadOS use overlay pseudo-fullscreen (no Element.requestFullscreen). */
export function prefersViewerOverlayFullscreen() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

/** Pin overlay viewer below the header (iOS URL bar only — phones use immersive overlay + CSS). */
export function shouldPinViewerOverlayFrame() {
  if (typeof window === "undefined") {
    return false;
  }
  return prefersViewerOverlayFullscreen();
}

/** Pin the viewer overlay to the visual viewport below the site header (iOS URL bar). */
export function viewerOverlayFramePx() {
  if (typeof window === "undefined") {
    return { topPx: 0, heightPx: 400 };
  }
  const headerBottom = measuredSiteHeaderBottomPx();
  const { bottom } = visualViewportMetrics();
  const heightPx = Math.max(200, bottom - headerBottom);
  return { topPx: headerBottom, heightPx };
}
