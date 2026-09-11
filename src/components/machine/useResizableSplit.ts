"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

const MIN_LEFT = 0.28;
const MAX_LEFT = 0.78;
const STORAGE_KEY = "spares-staff-split";

function readStoredSplit() {
  if (typeof window === "undefined") {
    return 0.62;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) {
    return 0.62;
  }
  return Math.min(MAX_LEFT, Math.max(MIN_LEFT, parsed));
}

export function useResizableSplit(enabled: boolean) {
  const [split, setSplit] = useState(readStoredSplit);
  const dragging = useRef(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    setSplit(readStoredSplit());
  }, [enabled]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0) {
      return;
    }
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [enabled]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!dragging.current || !container.current) {
      return;
    }
    const rect = container.current.getBoundingClientRect();
    const next = (event.clientX - rect.left) / rect.width;
    const clamped = Math.min(MAX_LEFT, Math.max(MIN_LEFT, next));
    setSplit(clamped);
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!dragging.current) {
      return;
    }
    dragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    window.localStorage.setItem(STORAGE_KEY, String(split));
  }, [split]);

  return {
    split,
    containerRef: container,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
