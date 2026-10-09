/** Visual viewport metrics for overlay sheet full detent (iOS URL bar / page scroll). */
export function visualViewportMetrics() {
  if (typeof window === "undefined") {
    return { offsetTop: 0, height: 0, bottom: 0 };
  }
  const vv = window.visualViewport;
  if (!vv) {
    return {
      offsetTop: 0,
      height: window.innerHeight,
      bottom: window.innerHeight,
    };
  }
  return {
    offsetTop: vv.offsetTop,
    height: vv.height,
    bottom: vv.offsetTop + vv.height,
  };
}

export function safeAreaTopPx() {
  if (typeof document === "undefined") {
    return 0;
  }
  const probe = document.createElement("div");
  probe.style.paddingTop = "env(safe-area-inset-top)";
  document.body.appendChild(probe);
  const pt = Number.parseFloat(getComputedStyle(probe).paddingTop);
  document.body.removeChild(probe);
  return Number.isFinite(pt) ? pt : 0;
}

export function safeAreaBottomPx() {
  if (typeof document === "undefined") {
    return 0;
  }
  const probe = document.createElement("div");
  probe.style.paddingBottom = "env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const pb = Number.parseFloat(getComputedStyle(probe).paddingBottom);
  document.body.removeChild(probe);
  return Number.isFinite(pb) ? pb : 0;
}

export function tabBarPx() {
  if (typeof document === "undefined") {
    return 56;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--spares-tabbar")
    .trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 56;
}

export function headerTokenPx() {
  if (typeof document === "undefined") {
    return 56;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--spares-header")
    .trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 56;
}

/** Header bottom in visual/client coordinates (sticky/in-flow aware). */
export function measuredSiteHeaderBottomPx() {
  if (typeof document === "undefined") {
    return headerTokenPx() + safeAreaTopPx();
  }
  const header = document.querySelector(".spares-header");
  if (header instanceof HTMLElement) {
    const bottom = header.getBoundingClientRect().bottom;
    if (Number.isFinite(bottom) && bottom > 0) {
      return bottom;
    }
  }
  const { offsetTop } = visualViewportMetrics();
  return headerTokenPx() + Math.max(offsetTop, safeAreaTopPx());
}

/**
 * Max sheet height for `is-full` so the grab bar stays below the header and inside
 * the visual viewport, with the sheet anchored above the tab bar.
 */
export function conversationSheetFullHeightPx() {
  if (typeof window === "undefined") {
    return 400;
  }
  const { offsetTop, bottom: visualBottom } = visualViewportMetrics();
  const bottomInset = tabBarPx() + safeAreaBottomPx();
  const headerBottom = measuredSiteHeaderBottomPx();
  const topClearance = Math.max(headerBottom, offsetTop + safeAreaTopPx()) + 8;

  const layoutBottom = window.innerHeight - bottomInset;
  const maxFromLayout = layoutBottom - topClearance;
  const maxFromVisual = visualBottom - bottomInset - topClearance;

  return Math.max(120, Math.min(maxFromLayout, maxFromVisual));
}
