import { randomUUID } from "node:crypto";
import type { CustomerAccount, Site } from "../types/index.ts";

export const ORG_SCHEMA_VERSION = 2;

type LegacySite = Site & { company?: string };
type LegacyUser = {
  siteIds?: string[];
  companyAccess?: string[];
};

type OrgSlice = {
  schemaVersion?: number;
  customers?: CustomerAccount[];
  sites?: LegacySite[];
  users?: LegacyUser[];
};

function slugCustomerId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `customer-${slug}` : `customer-${randomUUID()}`;
}

function siteCompany(site: LegacySite) {
  return site.company?.trim() ?? "";
}

function customerName(customer: CustomerAccount) {
  return customer.name.trim();
}

function findCustomerByName(
  customers: CustomerAccount[],
  company: string,
) {
  const needle = company.trim().toLowerCase();
  return customers.find(
    (row) => !row.deletedAt && customerName(row).toLowerCase() === needle,
  );
}

function siteMatchesCompany(
  site: LegacySite,
  company: string,
  customers: CustomerAccount[],
) {
  const needle = company.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  const legacy = siteCompany(site).toLowerCase();
  if (legacy && legacy === needle) {
    return true;
  }
  const customer = customers.find((row) => row.id === site.customerId);
  return customer ? customerName(customer).toLowerCase() === needle : false;
}

export function migrateOrgTree<T extends OrgSlice>(db: T): { db: T; changed: boolean } {
  if ((db.schemaVersion ?? 1) >= ORG_SCHEMA_VERSION && (db.customers?.length ?? 0) > 0) {
    return { db: normalizeOrgTree(db), changed: false };
  }

  let changed = false;
  const now = new Date().toISOString();
  const customers = [...(db.customers ?? [])];
  const sites = [...(db.sites ?? [])].map((site) => ({ ...site }));

  for (const site of sites) {
    if (site.deletedAt) {
      continue;
    }
    if (site.customerId) {
      continue;
    }
    const company = siteCompany(site);
    if (!company) {
      continue;
    }
    let customer = findCustomerByName(customers, company);
    if (!customer) {
      customer = {
        id: slugCustomerId(company),
        name: company,
        createdAt: now,
      };
      customers.push(customer);
      changed = true;
    }
    site.customerId = customer.id;
    changed = true;
  }

  const users = (db.users ?? []).map((user) => {
    const companyAccess = user.companyAccess ?? [];
    if (companyAccess.length === 0) {
      return user;
    }
    const expanded = new Set(user.siteIds ?? []);
    for (const company of companyAccess) {
      for (const site of sites) {
        if (site.deletedAt) {
          continue;
        }
        if (siteMatchesCompany(site, company, customers)) {
          expanded.add(site.id);
        }
      }
    }
    changed = true;
    return {
      ...user,
      siteIds: [...expanded],
      companyAccess: undefined,
    };
  });

  if (!changed && (db.schemaVersion ?? 1) >= ORG_SCHEMA_VERSION) {
    return { db: normalizeOrgTree(db), changed: false };
  }

  return {
    db: normalizeOrgTree({
      ...db,
      schemaVersion: Math.max(db.schemaVersion ?? 1, ORG_SCHEMA_VERSION),
      customers,
      sites,
      users,
    }),
    changed: true,
  };
}

export function normalizeOrgTree<T extends OrgSlice>(db: T): T {
  const customers = [...(db.customers ?? [])];
  const activeCustomers = customers.filter((row) => !row.deletedAt);
  const sites = [...(db.sites ?? [])]
    .map((site) => {
      if (site.deletedAt || site.customerId || !site.company) {
        return site;
      }
      const customer = findCustomerByName(activeCustomers, site.company);
      return customer ? { ...site, customerId: customer.id } : site;
    })
    .sort((a, b) => {
      const aDeleted = a.deletedAt ? 1 : 0;
      const bDeleted = b.deletedAt ? 1 : 0;
      if (aDeleted !== bDeleted) {
        return aDeleted - bDeleted;
      }
      return `${a.customerId ?? ""} ${a.name}`.localeCompare(`${b.customerId ?? ""} ${b.name}`);
    });
  return {
    ...db,
    schemaVersion: Math.max(db.schemaVersion ?? 1, ORG_SCHEMA_VERSION),
    customers,
    sites,
  };
}
