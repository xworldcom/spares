import type { CustomerAccount, MachineSummary, PublicUser, Role, Site } from "@/types";
import { belongsToTenant, effectiveTenantId } from "./tenant.ts";
import {
  customerAllSitesLabel,
  customerForSite,
  siteCompanyName,
  siteLabel as formatSiteLabel,
} from "./org.ts";

export type AccessGrant = {
  siteIds: string[];
  machineIds: string[];
};

export function grantFromUser(
  user: Pick<PublicUser, "siteIds" | "machineIds">,
): AccessGrant {
  return {
    siteIds: [...(user.siteIds ?? [])],
    machineIds: [...(user.machineIds ?? [])],
  };
}

export function machinesAtSite(
  siteId: string,
  machines: readonly Pick<MachineSummary, "id" | "siteId">[],
) {
  return machines.filter((row) => row.siteId === siteId);
}

export function isMachineGranted(
  grant: AccessGrant,
  machine: Pick<MachineSummary, "id" | "siteId">,
) {
  if (machine.siteId && grant.siteIds.includes(machine.siteId)) {
    return true;
  }
  return grant.machineIds.includes(machine.id);
}

export function isSiteFullyGranted(
  grant: AccessGrant,
  siteId: string,
  machines: readonly Pick<MachineSummary, "id" | "siteId">[],
) {
  if (grant.siteIds.includes(siteId)) {
    return true;
  }
  const atSite = machinesAtSite(siteId, machines);
  if (atSite.length === 0) {
    return false;
  }
  return atSite.every((row) => grant.machineIds.includes(row.id));
}

export function isSiteIndeterminate(
  grant: AccessGrant,
  siteId: string,
  machines: readonly Pick<MachineSummary, "id" | "siteId">[],
) {
  if (grant.siteIds.includes(siteId)) {
    return false;
  }
  const atSite = machinesAtSite(siteId, machines);
  const selected = atSite.filter((row) => grant.machineIds.includes(row.id));
  return selected.length > 0 && selected.length < atSite.length;
}

export function toggleSiteGrant(
  grant: AccessGrant,
  siteId: string,
  machines: readonly Pick<MachineSummary, "id" | "siteId">[],
): AccessGrant {
  const atSite = machinesAtSite(siteId, machines);
  if (isSiteFullyGranted(grant, siteId, machines)) {
    return {
      siteIds: grant.siteIds.filter((id) => id !== siteId),
      machineIds: grant.machineIds.filter(
        (id) => !atSite.some((row) => row.id === id),
      ),
    };
  }
  return {
    siteIds: [...new Set([...grant.siteIds, siteId])],
    machineIds: grant.machineIds.filter(
      (id) => !atSite.some((row) => row.id === id),
    ),
  };
}

export function toggleMachineGrant(
  grant: AccessGrant,
  machine: Pick<MachineSummary, "id" | "siteId">,
  machines: readonly Pick<MachineSummary, "id" | "siteId">[],
): AccessGrant {
  const siteId = machine.siteId;
  if (!siteId) {
    const nextMachineIds = new Set(grant.machineIds);
    if (nextMachineIds.has(machine.id)) {
      nextMachineIds.delete(machine.id);
    } else {
      nextMachineIds.add(machine.id);
    }
    return { ...grant, machineIds: [...nextMachineIds] };
  }

  const atSite = machinesAtSite(siteId, machines);
  if (grant.siteIds.includes(siteId)) {
    const nextMachineIds = atSite
      .filter((row) => row.id !== machine.id)
      .map((row) => row.id);
    return {
      siteIds: grant.siteIds.filter((id) => id !== siteId),
      machineIds: [
        ...new Set([...grant.machineIds.filter((id) => !atSite.some((row) => row.id === id)), ...nextMachineIds]),
      ],
    };
  }

  const nextMachineIds = new Set(grant.machineIds);
  if (nextMachineIds.has(machine.id)) {
    nextMachineIds.delete(machine.id);
  } else {
    nextMachineIds.add(machine.id);
  }
  const selectedAtSite = atSite.filter((row) => nextMachineIds.has(row.id));
  if (selectedAtSite.length === atSite.length && atSite.length > 0) {
    return {
      siteIds: [...new Set([...grant.siteIds, siteId])],
      machineIds: grant.machineIds.filter(
        (id) => !atSite.some((row) => row.id === id),
      ),
    };
  }
  return { ...grant, machineIds: [...nextMachineIds] };
}

/** Collapse full-site machine picks into siteIds and drop redundant machineIds. */
export function normalizeAccessGrant(
  grant: AccessGrant,
  machines: readonly Pick<MachineSummary, "id" | "siteId">[],
): AccessGrant {
  const siteIds = new Set(grant.siteIds);
  const machineIds = new Set(grant.machineIds);

  for (const siteId of [...siteIds]) {
    const atSite = machinesAtSite(siteId, machines);
    for (const row of atSite) {
      machineIds.delete(row.id);
    }
  }

  const siteIdsFromMachines = new Map<string, string[]>();
  for (const id of machineIds) {
    const machine = machines.find((row) => row.id === id);
    if (!machine?.siteId) {
      continue;
    }
    const rows = siteIdsFromMachines.get(machine.siteId) ?? [];
    rows.push(id);
    siteIdsFromMachines.set(machine.siteId, rows);
  }

  for (const [siteId, ids] of siteIdsFromMachines.entries()) {
    const atSite = machinesAtSite(siteId, machines);
    if (atSite.length > 0 && ids.length === atSite.length) {
      siteIds.add(siteId);
      for (const row of atSite) {
        machineIds.delete(row.id);
      }
    }
  }

  return {
    siteIds: [...siteIds].sort(),
    machineIds: [...machineIds].sort(),
  };
}

export function sitesForCustomer(
  customerId: string,
  sites: readonly Site[],
) {
  return sites
    .filter((site) => !site.deletedAt && site.customerId === customerId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function machinesForCustomer(
  customerId: string,
  sites: readonly Site[],
  machines: readonly Pick<MachineSummary, "id" | "name" | "siteId">[],
) {
  const siteIds = new Set(sitesForCustomer(customerId, sites).map((site) => site.id));
  return machines
    .filter((machine) => machine.siteId && siteIds.has(machine.siteId))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function customerIdFromGrant(
  grant: AccessGrant,
  sites: readonly Site[],
  machines: readonly Pick<MachineSummary, "id" | "siteId">[],
) {
  for (const siteId of grant.siteIds) {
    const site = sites.find((row) => row.id === siteId && !row.deletedAt);
    if (site?.customerId) {
      return site.customerId;
    }
  }
  for (const machineId of grant.machineIds) {
    const machine = machines.find((row) => row.id === machineId);
    const site = machine?.siteId
      ? sites.find((row) => row.id === machine.siteId && !row.deletedAt)
      : undefined;
    if (site?.customerId) {
      return site.customerId;
    }
  }
  return "";
}

export function staffQuotePersonScope(
  grant: AccessGrant,
  sites: readonly Site[],
  machines: readonly Pick<MachineSummary, "id" | "name" | "siteId">[],
  accounts: readonly CustomerAccount[] = [],
) {
  const accountId = customerIdFromGrant(grant, sites, machines);
  if (!accountId) {
    return {
      accountId: "",
      accounts: [] as CustomerAccount[],
      sites: [] as Site[],
      machines: [] as Pick<MachineSummary, "id" | "name" | "siteId">[],
    };
  }
  return {
    accountId,
    accounts: accounts.filter((row) => !row.deletedAt && row.id === accountId),
    sites: sitesForCustomer(accountId, sites),
    machines: machinesForCustomer(accountId, sites, machines),
  };
}

export function customerIdForGrant(
  grant: AccessGrant,
  sites: readonly Site[],
  machines: readonly Pick<MachineSummary, "id" | "siteId">[],
  accounts: readonly CustomerAccount[] = [],
) {
  const fromGrant = customerIdFromGrant(grant, sites, machines);
  if (fromGrant) {
    return fromGrant;
  }
  const active = accounts
    .filter((row) => !row.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
  return active[0]?.id ?? "";
}


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

export function accessSummaryParts(
  grant: AccessGrant,
  sites: readonly Site[],
  accounts: readonly CustomerAccount[] = [],
  machines: readonly Pick<MachineSummary, "id" | "name" | "siteId">[] = [],
) {
  const parts: string[] = [];
  const wholeSites = grant.siteIds
    .map((siteId) => sites.find((row) => row.id === siteId))
    .filter((site): site is Site => Boolean(site && !site.deletedAt))
    .sort((a, b) => siteLabel(a, accounts).localeCompare(siteLabel(b, accounts)));

  for (const site of wholeSites) {
    parts.push(siteLabel(site, accounts));
  }

  const partialBySite = new Map<string, Pick<MachineSummary, "id" | "name" | "siteId">[]>();
  for (const machineId of grant.machineIds) {
    const machine = machines.find((row) => row.id === machineId);
    if (!machine?.siteId || grant.siteIds.includes(machine.siteId)) {
      continue;
    }
    const rows = partialBySite.get(machine.siteId) ?? [];
    rows.push(machine);
    partialBySite.set(machine.siteId, rows);
  }

  for (const [siteId, rows] of [...partialBySite.entries()].sort((left, right) => {
    const leftSite = sites.find((site) => site.id === left[0]);
    const rightSite = sites.find((site) => site.id === right[0]);
    const leftLabel = leftSite
      ? siteLabel(leftSite, accounts)
      : left[0];
    const rightLabel = rightSite
      ? siteLabel(rightSite, accounts)
      : right[0];
    return leftLabel.localeCompare(rightLabel);
  })) {
    const site = sites.find((row) => row.id === siteId);
    if (!site || site.deletedAt) {
      continue;
    }
    const atSite = machinesAtSite(siteId, machines);
    if (rows.length === 1) {
      parts.push(`${siteLabel(site, accounts)} · ${rows[0].name}`);
    } else if (rows.length === atSite.length && atSite.length > 0) {
      parts.push(siteLabel(site, accounts));
    } else {
      parts.push(`${siteLabel(site, accounts)} (${rows.length} machines)`);
    }
  }

  return parts;
}

export function accessSummary(
  user: Pick<PublicUser, "siteIds" | "machineIds">,
  accounts: readonly CustomerAccount[] = [],
  sites: readonly Site[] = [],
  machines: readonly Pick<MachineSummary, "id" | "name" | "siteId">[] = [],
) {
  const grant = grantFromUser(user);
  const parts = accessSummaryParts(grant, sites, accounts, machines);
  if (parts.length === 0) {
    return "";
  }
  if (parts.length <= 2) {
    return parts.join(", ");
  }
  return `${parts.slice(0, 2).join(", ")} +${parts.length - 2}`;
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

export function canCreateMachineAtSite(
  user: Pick<
    PublicUser,
    "role" | "siteIds" | "companyAccess" | "machineIds" | "tenantId"
  >,
  site: Pick<Site, "id" | "deletedAt" | "customerId" | "company" | "tenantId">,
  machines: readonly Pick<MachineSummary, "id" | "siteId">[] = [],
  accounts: readonly CustomerAccount[] = [],
) {
  if (site.deletedAt) {
    return false;
  }
  if (user.role === "staff") {
    if (!user.tenantId) {
      return false;
    }
    return belongsToTenant(site, user.tenantId);
  }
  if (user.tenantId && user.tenantId !== effectiveTenantId(site)) {
    return false;
  }
  if ((user.siteIds ?? []).includes(site.id)) {
    return true;
  }
  if (
    (user.machineIds ?? []).some((machineId) =>
      machines.some((machine) => machine.id === machineId && machine.siteId === site.id),
    )
  ) {
    return true;
  }
  const hasModernAccess =
    (user.siteIds?.length ?? 0) > 0 || (user.machineIds?.length ?? 0) > 0;
  const companies = user.companyAccess ?? [];
  if (!hasModernAccess && companies.length > 0) {
    const company = siteCompanyName(site as Site, accounts);
    if (!company) {
      return false;
    }
    const needle = company.toLowerCase();
    return companies.some((row) => row.toLowerCase() === needle);
  }
  return false;
}

export function canAccessMachine(
  user: Pick<
    PublicUser,
    "role" | "siteIds" | "companyAccess" | "machineIds" | "tenantId"
  >,
  machine: {
    id?: string;
    siteId?: string | null;
    company?: string | null;
    tenantId?: string;
  },
  sites: readonly Site[] = [],
  accounts: readonly CustomerAccount[] = [],
) {
  if (user.role === "staff") {
    if (!user.tenantId) {
      return false;
    }
    return belongsToTenant(machine, user.tenantId);
  }
  if (user.tenantId && user.tenantId !== effectiveTenantId(machine)) {
    return false;
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
  const hasModernAccess =
    (user.siteIds?.length ?? 0) > 0 || (user.machineIds?.length ?? 0) > 0;
  const companies = user.companyAccess ?? [];
  if (!hasModernAccess && companies.length > 0) {
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
  return false;
}

export function toPublicUser(
  user: {
    id: string;
    email: string;
    name?: string;
    role: Role;
    tenantId?: string;
    siteIds?: string[];
    companyAccess?: string[];
    machineIds?: string[];
    emailDomain?: string;
    deletedAt?: string;
  },
  sites: readonly Site[] = [],
  accounts: readonly CustomerAccount[] = [],
  meta?: { platformOwner?: boolean; tenantId?: string },
): PublicUser {
  const tenantId = meta?.tenantId ?? user.tenantId;
  const platformOwner = meta?.platformOwner;
  if (user.role !== "customer") {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(tenantId ? { tenantId } : {}),
      ...(platformOwner ? { platformOwner: true } : {}),
    };
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
    ...(tenantId ? { tenantId } : {}),
    ...(platformOwner ? { platformOwner: true } : {}),
    siteIds,
    companyAccess,
    machineIds,
    ...(user.name?.trim() ? { name: user.name.trim() } : {}),
    ...(domain ? { emailDomain: domain } : {}),
    ...(resolved && resolved.length > 0 ? { sites: resolved } : {}),
    ...(user.deletedAt ? { deletedAt: user.deletedAt } : {}),
  };
}

export { customerAllSitesLabel };
