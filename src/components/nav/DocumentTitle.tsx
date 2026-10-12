"use client";

import { useEffect } from "react";

const BASE = "OEE360";

export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    const trimmed = title.trim();
    document.title = trimmed ? `${trimmed} · ${BASE}` : BASE;
    return () => {
      document.title = BASE;
    };
  }, [title]);
  return null;
}
