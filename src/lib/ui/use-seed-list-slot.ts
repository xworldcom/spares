"use client";

import { useEffect, useRef } from "react";
import { seedListSlot } from "@/lib/api/list-fetch";

/** One-shot RSC → client list slot (enables If-None-Match on background refresh). */
export function useSeedListSlotOnce<T>(
  warmKey: string,
  path: string,
  body: T | null | undefined,
  etag: string | null | undefined,
) {
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || body == null || !etag) {
      return;
    }
    seeded.current = true;
    seedListSlot(warmKey, path, body, etag);
  }, [body, etag, path, warmKey]);
}
