/** Pin the sheet thread scroller so the latest row sits above the composer. */
export function threadScrollerMaxScroll(body: HTMLElement): number {
  return Math.max(0, body.scrollHeight - body.clientHeight);
}

export function threadScrollerFitsViewport(body: HTMLElement): boolean {
  return threadScrollerMaxScroll(body) <= 1;
}

export function threadScrollerOverflows(body: HTMLElement): boolean {
  const overflowY = getComputedStyle(body).overflowY;
  return overflowY === "auto" || overflowY === "scroll";
}

/** Underfilled list: flex-end bottom glue. Overflow: bounded scroller with normal scroll. */
export type ThreadScrollerLayout = "underflow" | "scrollable";

export function resolveThreadScrollerLayout(body: HTMLElement): ThreadScrollerLayout {
  if (!threadScrollerOverflows(body)) {
    return "underflow";
  }
  return threadScrollerFitsViewport(body) ? "underflow" : "scrollable";
}

/** Sync DOM mode only — does not change scrollTop. */
export function applyThreadScrollerLayout(body: HTMLElement): ThreadScrollerLayout {
  const layout = resolveThreadScrollerLayout(body);
  if (layout === "underflow") {
    body.setAttribute("data-thread-underflow", "");
  } else {
    body.removeAttribute("data-thread-underflow");
  }
  return layout;
}

/**
 * When `docked`, pin the latest row above the composer.
 * When undocked (user scrolled history), never touch scrollTop.
 */
export function pinThreadScrollerToComposer(body: HTMLElement, docked = true): void {
  const layout = applyThreadScrollerLayout(body);
  if (!docked) {
    return;
  }
  if (layout === "underflow") {
    if (body.scrollTop !== 0) {
      body.scrollTop = 0;
    }
    return;
  }
  const top = threadScrollerMaxScroll(body);
  if (Math.abs(body.scrollTop - top) > 0.5) {
    body.scrollTop = top;
  }
}

export function flushPinThreadScrollerToComposer(body: HTMLElement, docked = true): void {
  pinThreadScrollerToComposer(body, docked);
  void body.offsetHeight;
  pinThreadScrollerToComposer(body, docked);
  void body.offsetHeight;
  pinThreadScrollerToComposer(body, docked);
}
