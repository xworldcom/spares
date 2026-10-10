"use client";

import { useEffect } from "react";
import { leavesCurrentPage } from "./pending-send-guard";

/** Warn before tab close or in-app navigation when `active` is true. */
export function useLeavePageGuard(active: boolean, prompt: string) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) {
        return;
      }
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || !leavesCurrentPage(anchor, window.location)) {
        return;
      }
      if (!window.confirm(prompt)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [active, prompt]);
}
