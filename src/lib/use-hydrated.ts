"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => undefined;
}

/** False during SSR; true on the client after hydration. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
