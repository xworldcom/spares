const PASSWORD_QUERY_KEYS = new Set([
  "password",
  "passwd",
  "pwd",
  "pass",
]);

export function isPasswordQueryKey(key: string) {
  return PASSWORD_QUERY_KEYS.has(key.trim().toLowerCase());
}

/** Remove password (and aliases) from query params. Returns true if anything was stripped. */
export function stripCredentialSearchParams(params: URLSearchParams): boolean {
  let stripped = false;
  for (const key of [...params.keys()]) {
    if (isPasswordQueryKey(key)) {
      params.delete(key);
      stripped = true;
    }
  }
  return stripped;
}

export function stripCredentialQuery(url: string): { href: string; stripped: boolean } {
  const parsed = new URL(url, "http://spares.local");
  const stripped = stripCredentialSearchParams(parsed.searchParams);
  return {
    href: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    stripped,
  };
}

/** Same-origin `next=` target or the `/machines` fallback. Query is data, not a target. */
export function sanitizeNextPath(next: string | null | undefined) {
  if (!next) {
    return "/machines";
  }
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || /[\\\0]/.test(trimmed)) {
    return "/machines";
  }
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return "/machines";
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\0]/.test(decoded)) {
    return "/machines";
  }
  try {
    const resolved = new URL(trimmed, "https://spares.invalid");
    if (resolved.origin !== "https://spares.invalid" || resolved.username || resolved.password) {
      return "/machines";
    }
    const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    if (!path.startsWith("/") || path.startsWith("//")) {
      return "/machines";
    }
    return path;
  } catch {
    return "/machines";
  }
}

export function stripCredentialQueryFromLocation() {
  if (typeof window === "undefined") {
    return;
  }
  const next = stripCredentialQuery(window.location.href);
  if (next.stripped) {
    window.history.replaceState(window.history.state, "", next.href);
  }
}
