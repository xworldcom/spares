/** CSS variable: iOS Safari (and similar) chrome covering the layout viewport bottom. */
export const SPARES_VV_BOTTOM_VAR = "--spares-vv-bottom";

export type VisualViewportBox = {
  height: number;
  offsetTop: number;
};

/**
 * Gap between the layout viewport bottom and the visual viewport bottom.
 * When iOS Safari's toolbar is showing, fixed `bottom: 0` sits under that chrome;
 * this inset lifts bottom chrome into the usable area. Zero when chrome is hidden.
 */
export function visualViewportBottomInset(
  innerHeight: number,
  viewport: VisualViewportBox | null | undefined,
): number {
  if (!viewport) {
    return 0;
  }
  return Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop));
}

export function applyVisualViewportBottom(
  style: { setProperty: (name: string, value: string) => void },
  insetPx: number,
): void {
  style.setProperty(SPARES_VV_BOTTOM_VAR, `${insetPx}px`);
}

export function syncVisualViewportBottom(
  root: { style: { setProperty: (name: string, value: string) => void } },
  innerHeight: number,
  viewport: VisualViewportBox | null | undefined,
): void {
  applyVisualViewportBottom(root.style, visualViewportBottomInset(innerHeight, viewport));
}

type ViewportListener = EventListenerOrEventListenerObject;

type ViewportEventTarget = {
  addEventListener: (type: string, listener: ViewportListener) => void;
  removeEventListener: (type: string, listener: ViewportListener) => void;
};

type ViewportEvents = ViewportEventTarget & {
  visualViewport?: ViewportEventTarget | null;
  document: ViewportEventTarget;
};

/**
 * Keep bottom chrome aligned when Safari shows/hides its toolbar, including
 * after leave/return (`pageshow` / `visibilitychange`) without requiring a
 * manual refresh.
 */
export function subscribeVisualViewport(onChange: () => void, view: ViewportEvents): () => void {
  const vv = view.visualViewport;
  vv?.addEventListener("resize", onChange);
  vv?.addEventListener("scroll", onChange);
  view.addEventListener("resize", onChange);
  view.addEventListener("pageshow", onChange);
  view.document.addEventListener("visibilitychange", onChange);
  onChange();
  return () => {
    vv?.removeEventListener("resize", onChange);
    vv?.removeEventListener("scroll", onChange);
    view.removeEventListener("resize", onChange);
    view.removeEventListener("pageshow", onChange);
    view.document.removeEventListener("visibilitychange", onChange);
  };
}

export function scheduleVisualViewportSync(sync: () => void): void {
  sync();
  if (typeof requestAnimationFrame !== "function") {
    return;
  }
  requestAnimationFrame(() => {
    sync();
    requestAnimationFrame(sync);
  });
}
