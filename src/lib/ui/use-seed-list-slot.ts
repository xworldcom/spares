"use client";

import { useLayoutEffect, useRef } from "react";
import { seedListSlot } from "@/lib/api/list-fetch";

/** One-shot RSC → client list slot (enables If-None-Match on background refresh). */
export function useSeedListSlotOnce<T>(
  warmKey: string,
  path: string,
  body: T | null | undefined,
  etag: string | null | undefined,
  enabled = true,
) {
  const seeded = useRef(false);
  useLayoutEffect(() => {
    if (!enabled || seeded.current || body == null || !etag) {
      return;
    }
    seeded.current = true;
    seedListSlot(warmKey, path, body, etag);
  }, [body, enabled, etag, path, warmKey]);
}
