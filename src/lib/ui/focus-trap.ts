const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

/** Keep Tab / Shift+Tab inside `root`; optional first focus target on Tab from outside. */
export function bindFocusTrap(
  root: HTMLElement,
  options?: { initialFocus?: HTMLElement | null },
): () => void {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Tab") {
      return;
    }
    const items = focusableElements(root);
    if (items.length === 0) {
      return;
    }
    const active = document.activeElement;
    if (!root.contains(active)) {
      event.preventDefault();
      (options?.initialFocus && items.includes(options.initialFocus)
        ? options.initialFocus
        : items[0]
      ).focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey) {
      if (active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  root.addEventListener("keydown", onKeyDown, true);
  return () => root.removeEventListener("keydown", onKeyDown, true);
}
