import type { CustomerAccount, PublicUser, Role, Site } from "@/types";
import {
  customerAllSitesLabel,
  customerForSite,
  siteCompanyName,
  siteLabel as formatSiteLabel,
} from "./org.ts";

export function siteLabel(
  site: Pick<Site, "name"> & Partial<Pick<Site, "customerId" | "company">>,
  accounts: readonly CustomerAccount[] = [],
) {
  return formatSiteLabel(site, accounts);
}

export function companyAllLabel(company: string) {
  return `${company} · All sites`;
}

export type AccessScope = {
  siteIds: string[];
};

export function accessLabels(
  user: Pick<PublicUser, "siteIds" | "sites">,
  accounts: readonly CustomerAccount[] = [],
) {
  const sites = user.sites ?? [];
  if (sites.length === 0) {
    return [];
  }
  return sites.map((site) => siteLabel(site, accounts));
}

export function accessSummary(
  user: Pick<PublicUser, "siteIds" | "sites">,
  accounts: readonly CustomerAccount[] = [],
) {
  const labels = accessLabels(user, accounts);
  if (labels.length === 0) {
    return "";
  }
  if (labels.length <= 2) {
    return labels.join(", ");
  }
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

/** @deprecated Single-select access; prefer explicit siteIds arrays. */
export function accessValue(user: Pick<PublicUser, "siteIds" | "companyAccess">) {
  const siteId = user.siteIds?.[0];
  if (siteId) {
    return `site:${siteId}`;
  }
  return "";
}

/** @deprecated Single-select access; prefer explicit siteIds arrays. */
export function parseAccessValue(value: string): AccessScope {
  if (value.startsWith("site:")) {
    const siteId = value.slice("site:".length).trim();
    return { siteIds: siteId ? [siteId] : [] };
  }
  if (value) {
    return { siteIds: [value] };
  }
  return { siteIds: [] };
}

export function accessOptions(
  sites: readonly Site[],
  accounts: readonly CustomerAccount[] = [],
) {
  const grouped = new Map<string, Site[]>();
  for (const site of sites) {
    if (site.deletedAt) {
      continue;
    }
    const rows = grouped.get(site.customerId) ?? [];
    rows.push(site);
    grouped.set(site.customerId, rows);
  }
  const options: { value: string; label: string; customerId: string }[] = [];
  const sortedCustomers = [...accounts]
    .filter((row) => !row.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const customer of sortedCustomers) {
    const rows = grouped.get(customer.id) ?? [];
    for (const site of rows.sort((a, b) => a.name.localeCompare(b.name))) {
      options.push({
        value: site.id,
        label: siteLabel(site, accounts),
        customerId: customer.id,
      });
    }
  }
  for (const [customerId, rows] of grouped.entries()) {
    if (sortedCustomers.some((customer) => customer.id === customerId)) {
      continue;
    }
    for (const site of rows.sort((a, b) => a.name.localeCompare(b.name))) {
      options.push({
        value: site.id,
        label: siteLabel(site, accounts),
        customerId,
      });
    }
  }
  return options;
}

export function accessOptionsGrouped(
  sites: readonly Site[],
  accounts: readonly CustomerAccount[] = [],
) {
  const grouped = new Map<
    string,
    { customer: CustomerAccount | null; sites: Site[] }
  >();
  for (const site of sites) {
    if (site.deletedAt) {
      continue;
    }
    const customer = customerForSite(site, accounts);
    const key = customer?.id ?? site.customerId;
    const row = grouped.get(key) ?? { customer: customer ?? null, sites: [] };
    row.sites.push(site);
    grouped.set(key, row);
  }
  return [...grouped.values()]
    .map((row) => ({
      customer: row.customer,
      customerName:
        row.customer?.name ?? siteCompanyName(row.sites[0] ?? { customerId: "", name: "", createdAt: "" }, accounts),
      sites: row.sites.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName));
}

/** @deprecated Use accessSummary instead. */
export function accessLabel(
  user: Pick<PublicUser, "siteIds" | "companyAccess" | "sites">,
  accounts: readonly CustomerAccount[] = [],
) {
  return accessSummary(user, accounts);
}

export function canAccessMachine(
  user: Pick<PublicUser, "role" | "siteIds" | "companyAccess" | "machineIds">,
  machine: { id?: string; siteId?: string | null; company?: string | null },
  sites: readonly Site[] = [],
  accounts: readonly CustomerAccount[] = [],
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
  const site = sites.find((row) => row.id === siteId);
  const company =
    machine.company ??
    (site ? siteCompanyName(site, accounts) : "") ??
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
    deletedAt?: string;
  },
  sites: readonly Site[] = [],
  accounts: readonly CustomerAccount[] = [],
): PublicUser {
  if (user.role !== "customer") {
    return { id: user.id, email: user.email, role: user.role };
  }
  const siteIds = user.siteIds ?? [];
  const companyAccess = user.companyAccess ?? [];
  const machineIds = user.machineIds ?? [];
  const resolved =
    siteIds.length > 0
      ? sites.filter((site) => siteIds.includes(site.id) && !site.deletedAt)
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
    ...(user.deletedAt ? { deletedAt: user.deletedAt } : {}),
  };
}

export { customerAllSitesLabel };
