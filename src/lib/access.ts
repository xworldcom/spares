import type { PublicUser, Role, Site } from "@/types";

export function siteLabel(site: Pick<Site, "company" | "name">) {
  return `${site.company} · ${site.name}`;
}

export function canAccessMachine(
  user: Pick<PublicUser, "role" | "siteIds">,
  machine: { siteId?: string | null },
) {
  if (user.role === "staff") {
    return true;
  }
  const siteId = machine.siteId;
  if (!siteId) {
    return false;
  }
  return (user.siteIds ?? []).includes(siteId);
}

export function toPublicUser(
  user: { id: string; email: string; role: Role; siteIds?: string[] },
  sites: readonly Site[] = [],
): PublicUser {
  const siteIds = user.role === "customer" ? (user.siteIds ?? []) : undefined;
  const resolved =
    siteIds && siteIds.length > 0
      ? sites.filter((site) => siteIds.includes(site.id))
      : undefined;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    ...(siteIds ? { siteIds } : {}),
    ...(resolved && resolved.length > 0 ? { sites: resolved } : {}),
  };
}
