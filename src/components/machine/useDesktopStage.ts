"use client";

import { useEffect, useState } from "react";

export const DESKTOP_STAGE = "(min-width: 1024px) and (min-height: 840px)";

export function useDesktopStage() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_STAGE);
    function sync() {
      setDesktop(media.matches);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return desktop;
}
