/** Pin the sheet thread scroller so the latest row sits above the composer. */
export function threadScrollerMaxScroll(body: HTMLElement): number {
  return Math.max(0, body.scrollHeight - body.clientHeight);
}

export function threadScrollerOverflows(body: HTMLElement): boolean {
  const overflowY = getComputedStyle(body).overflowY;
  return overflowY === "auto" || overflowY === "scroll";
}

/**
 * Flex-end / hidden overflow: scrollTop 0. Scrollable full height: max scroll.
 * Safe to call during layout; idempotent.
 */
export function pinThreadScrollerToComposer(body: HTMLElement): void {
  if (threadScrollerOverflows(body)) {
    const top = threadScrollerMaxScroll(body);
    if (Math.abs(body.scrollTop - top) > 0.5) {
      body.scrollTop = top;
    }
    return;
  }
  if (body.scrollTop !== 0) {
    body.scrollTop = 0;
  }
}

export function flushPinThreadScrollerToComposer(body: HTMLElement): void {
  pinThreadScrollerToComposer(body);
  void body.offsetHeight;
  pinThreadScrollerToComposer(body);
}
