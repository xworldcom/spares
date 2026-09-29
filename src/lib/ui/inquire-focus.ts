/** Extra page padding while the software keyboard covers the layout viewport. */
export function inquireKeyboardInset(
  layoutHeight: number,
  viewportHeight: number,
  viewportOffsetTop: number,
) {
  return Math.max(0, Math.round(layoutHeight - viewportHeight - viewportOffsetTop));
}

/** Scroll delta that brings a focused control between the sticky header and the keyboard. */
export function inquireRevealDelta(
  rect: { top: number; bottom: number },
  visibleTop: number,
  visibleBottom: number,
) {
  if (rect.bottom > visibleBottom) {
    return rect.bottom - visibleBottom;
  }
  if (rect.top < visibleTop) {
    return rect.top - visibleTop;
  }
  return 0;
}
