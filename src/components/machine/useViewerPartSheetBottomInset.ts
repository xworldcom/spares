"use client";

import { useEffect, useState, type RefObject } from "react";

/** Pixels of the viewer layout covered by the bottom-docked part sheet chip (390 3D). */
export function useViewerPartSheetBottomInset(
  layoutRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const [insetPx, setInsetPx] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInsetPx(0);
      return;
    }
    const layout = layoutRef.current;
    if (!layout) {
      setInsetPx(0);
      return;
    }

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const chip = layout.querySelector<HTMLElement>("[data-part-sheet-chip]");
        if (!chip) {
          setInsetPx(0);
          return;
        }
        const layoutRect = layout.getBoundingClientRect();
        const chipRect = chip.getBoundingClientRect();
        setInsetPx(Math.max(0, Math.round(layoutRect.bottom - chipRect.top)));
      });
    };

    const ro = new ResizeObserver(measure);
    ro.observe(layout);
    const chip = layout.querySelector("[data-part-sheet-chip]");
    if (chip) {
      ro.observe(chip);
    }
    const mo = new MutationObserver(measure);
    mo.observe(layout, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-part-sheet-more-open", "class", "style"],
    });
    measure();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
    };
  }, [enabled, layoutRef]);

  return insetPx;
}
