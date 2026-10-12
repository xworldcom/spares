"use client";

import { useLayoutEffect } from "react";

const BASE = "OEE360";

function formatDocumentTitle(title: string) {
  const trimmed = title.trim();
  return trimmed ? `${trimmed} · ${BASE}` : BASE;
}

export function DocumentTitle({ title }: { title: string }) {
  const next = formatDocumentTitle(title);
  if (typeof document !== "undefined" && document.title !== next) {
    document.title = next;
  }
  useLayoutEffect(() => {
    document.title = next;
  }, [next]);
  return null;
}
