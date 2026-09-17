"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, type ComponentProps } from "react";
import { prefetchAppRoute } from "@/lib/nav/prefetch";

type PrefetchLinkProps = ComponentProps<typeof Link> & {
  warm?: () => void;
};

function hrefToString(href: PrefetchLinkProps["href"]) {
  if (typeof href === "string") {
    return href;
  }
  const pathname = href.pathname ?? "";
  const query = href.query;
  if (!query || typeof query !== "object") {
    return pathname;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const part of value) {
        params.append(key, String(part));
      }
    } else {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function PrefetchLink({
  href,
  warm,
  onPointerEnter,
  onTouchStart,
  ...rest
}: PrefetchLinkProps) {
  const router = useRouter();
  const prefetched = useRef(false);

  const prefetch = useCallback(() => {
    if (prefetched.current) {
      warm?.();
      return;
    }
    prefetched.current = true;
    prefetchAppRoute(router, hrefToString(href));
    warm?.();
  }, [href, router, warm]);

  const { onFocus, ...linkProps } = rest;

  return (
    <Link
      href={href}
      prefetch={true}
      onPointerEnter={(event) => {
        prefetch();
        onPointerEnter?.(event);
      }}
      onTouchStart={(event) => {
        prefetch();
        onTouchStart?.(event);
      }}
      onFocus={(event) => {
        prefetch();
        onFocus?.(event);
      }}
      {...linkProps}
    />
  );
}
