"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { useDesktopStage } from "@/components/machine/useDesktopStage";

const STABLE_FRAMES = 2;

/**
 * Waits until after hydration and the desktop/mobile stage breakpoint has been
 * stable for a couple frames so the machine viewer mounts on the final layout tree.
 */
export function useViewerLayoutReady() {
  const hydrated = useHydrated();
  const desktopStage = useDesktopStage();
  const [ready, setReady] = useState(false);
  const stageRef = useRef(desktopStage);

  useEffect(() => {
    if (!hydrated) {
      setReady(false);
      return;
    }

    let alive = true;
    let stable = 0;
    let frame = 0;
    stageRef.current = desktopStage;

    function tick() {
      if (!alive) {
        return;
      }
      if (desktopStage === stageRef.current) {
        stable += 1;
      } else {
        stable = 0;
        stageRef.current = desktopStage;
      }
      if (stable >= STABLE_FRAMES) {
        setReady(true);
        return;
      }
      frame = requestAnimationFrame(tick);
    }

    setReady(false);
    stable = 0;
    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [hydrated, desktopStage]);

  return ready;
}
