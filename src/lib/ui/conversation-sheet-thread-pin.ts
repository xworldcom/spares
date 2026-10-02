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

function syncThreadScrollerUnderflow(body: HTMLElement): void {
  const underflow =
    threadScrollerOverflows(body) && threadScrollerFitsViewport(body);
  if (underflow) {
    body.setAttribute("data-thread-underflow", "");
  } else {
    body.removeAttribute("data-thread-underflow");
  }
}

/**
 * Flex-end / hidden overflow: scrollTop 0. Underfilled auto scroller: scrollTop 0 + underflow
 * marker (flex-end after motion settles). Scrollable full height: max scroll.
 * Safe to call during layout; idempotent.
 */
export function pinThreadScrollerToComposer(body: HTMLElement): void {
  syncThreadScrollerUnderflow(body);
  if (threadScrollerOverflows(body)) {
    if (threadScrollerFitsViewport(body)) {
      if (body.scrollTop !== 0) {
        body.scrollTop = 0;
      }
      return;
    }
    const top = threadScrollerMaxScroll(body);
    if (Math.abs(body.scrollTop - top) > 0.5) {
      body.scrollTop = top;
    }
    return;
  }
  body.removeAttribute("data-thread-underflow");
  if (body.scrollTop !== 0) {
    body.scrollTop = 0;
  }
}

export function flushPinThreadScrollerToComposer(body: HTMLElement): void {
  pinThreadScrollerToComposer(body);
  void body.offsetHeight;
  pinThreadScrollerToComposer(body);
  void body.offsetHeight;
  pinThreadScrollerToComposer(body);
}
