import type { PublicUser, Role, Site } from "@/types";

export function siteLabel(site: Pick<Site, "company" | "name">) {
  return `${site.company} · ${site.name}`;
}

export function companyAllLabel(company: string) {
  return `${company} · All plants`;
}

export type AccessScope = {
  siteIds: string[];
  companyAccess: string[];
};

export function accessValue(user: Pick<PublicUser, "siteIds" | "companyAccess">) {
  const company = user.companyAccess?.[0];
  if (company) {
    return `company:${company}`;
  }
  const siteId = user.siteIds?.[0];
  if (siteId) {
    return `site:${siteId}`;
  }
  return "";
}

export function parseAccessValue(value: string): AccessScope {
  if (value.startsWith("company:")) {
    const company = value.slice("company:".length).trim();
    return { siteIds: [], companyAccess: company ? [company] : [] };
  }
  if (value.startsWith("site:")) {
    const siteId = value.slice("site:".length).trim();
    return { siteIds: siteId ? [siteId] : [], companyAccess: [] };
  }
  if (value) {
    return { siteIds: [value], companyAccess: [] };
  }
  return { siteIds: [], companyAccess: [] };
}

export function accessOptions(sites: readonly Site[]) {
  const companies = [...new Set(sites.map((site) => site.company))].sort((a, b) =>
    a.localeCompare(b),
  );
  const options: { value: string; label: string }[] = [];
  for (const company of companies) {
    options.push({
      value: `company:${company}`,
      label: companyAllLabel(company),
    });
    for (const site of sites.filter((row) => row.company === company)) {
      options.push({
        value: `site:${site.id}`,
        label: siteLabel(site),
      });
    }
  }
  return options;
}

export function accessLabel(
  user: Pick<PublicUser, "siteIds" | "companyAccess" | "sites">,
) {
  const company = user.companyAccess?.[0];
  if (company) {
    return companyAllLabel(company);
  }
  const site = user.sites?.[0];
  return site ? siteLabel(site) : "";
}

export function canAccessMachine(
  user: Pick<PublicUser, "role" | "siteIds" | "companyAccess" | "machineIds">,
  machine: { id?: string; siteId?: string | null; company?: string | null },
  sites: readonly Site[] = [],
) {
  if (user.role === "staff") {
    return true;
  }
  if (machine.id && (user.machineIds ?? []).includes(machine.id)) {
    return true;
  }
  const siteId = machine.siteId;
  if (!siteId) {
    return false;
  }
  if ((user.siteIds ?? []).includes(siteId)) {
    return true;
  }
  const companies = user.companyAccess ?? [];
  if (companies.length === 0) {
    return false;
  }
  const company =
    machine.company ??
    sites.find((site) => site.id === siteId)?.company ??
    "";
  if (!company) {
    return false;
  }
  const needle = company.toLowerCase();
  return companies.some((row) => row.toLowerCase() === needle);
}

export function toPublicUser(
  user: {
    id: string;
    email: string;
    role: Role;
    siteIds?: string[];
    companyAccess?: string[];
    machineIds?: string[];
    emailDomain?: string;
  },
  sites: readonly Site[] = [],
): PublicUser {
  if (user.role !== "customer") {
    return { id: user.id, email: user.email, role: user.role };
  }
  const siteIds = user.siteIds ?? [];
  const companyAccess = user.companyAccess ?? [];
  const machineIds = user.machineIds ?? [];
  const resolved =
    siteIds.length > 0
      ? sites.filter((site) => siteIds.includes(site.id))
      : undefined;
  const domain = user.email.split("@")[1] ?? user.emailDomain;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    siteIds,
    companyAccess,
    machineIds,
    ...(domain ? { emailDomain: domain } : {}),
    ...(resolved && resolved.length > 0 ? { sites: resolved } : {}),
  };
}
