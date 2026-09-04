/** Exact path, or a child segment — not a shared prefix like /machines vs /machines/new. */
export function pathMatchesHref(pathname: string, href: string): boolean {
  if (pathname === href) {
    return true;
  }
  if (href === "/") {
    return false;
  }
  return pathname.startsWith(`${href}/`);
}

/** Longest matching href wins so sibling routes do not light up together. */
export function isNavActive(
  pathname: string,
  href: string,
  hrefs: readonly string[],
): boolean {
  if (!pathMatchesHref(pathname, href)) {
    return false;
  }
  return !hrefs.some(
    (other) =>
      other !== href && other.length > href.length && pathMatchesHref(pathname, other),
  );
}
