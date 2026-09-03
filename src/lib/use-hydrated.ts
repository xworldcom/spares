"use client";

import { useLayoutEffect, useState } from "react";

/** False on the server and the first client render; true after hydration. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useLayoutEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
