export const PENDING_SEND_LEAVE_PROMPT =
  "Your message is still sending. Leave this page anyway?";

export const UNSAVED_QUOTE_LEAVE_PROMPT =
  "You have unsaved quote changes. Leave this page anyway?";

/** True when following `anchor` would client-navigate to a different in-app page. */
export function leavesCurrentPage(
  anchor: { href: string; target?: string; hasAttribute?: (name: string) => boolean },
  current: { href: string; origin: string },
): boolean {
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute?.("download")) {
    return false;
  }
  let next: URL;
  try {
    next = new URL(anchor.href, current.href);
  } catch {
    return false;
  }
  if (next.origin !== current.origin) {
    return false;
  }
  const here = new URL(current.href);
  return next.pathname !== here.pathname || next.search !== here.search;
}
