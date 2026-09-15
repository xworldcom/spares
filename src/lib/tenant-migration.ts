import { randomUUID } from "node:crypto";
import type { CustomerAccount, Site } from "../types/index.ts";
import {
  DEFAULT_TENANT_ID,
  TENANT_SCHEMA_VERSION,
  defaultTenantRecord,
  slugifyTenant,
} from "./tenant.ts";

type TenantUser = { tenantId?: string };
type TenantCustomer = CustomerAccount & { tenantId?: string };
type TenantSite = Site & { tenantId?: string };
type TenantMachine = { id: string; tenantId?: string };
type TenantQuote = { id: string; tenantId?: string };
type TenantTicket = { id: string; tenantId?: string };
type TenantManual = { id: string; tenantId?: string };
type TenantUsage = { machineId: string; tenantId?: string };
type TenantBug = { id: string; tenantId?: string };
type TenantView = { id: string; tenantId?: string };

export type TenantSlice = {
  schemaVersion?: number;
  tenants?: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: string;
  }>;
  users?: TenantUser[];
  customers?: TenantCustomer[];
  sites?: TenantSite[];
  machines?: TenantMachine[];
  quotes?: TenantQuote[];
  tickets?: TenantTicket[];
  manuals?: TenantManual[];
  machineUsage?: TenantUsage[];
  bugReports?: TenantBug[];
  machineViews?: TenantView[];
};

function stamp<T extends { tenantId?: string }>(
  rows: readonly T[] | undefined,
  tenantId: string,
): T[] {
  if (!rows?.length) {
    return [];
  }
  let changed = false;
  const next = rows.map((row) => {
    if (row.tenantId === tenantId) {
      return row;
    }
    changed = true;
    return { ...row, tenantId };
  });
  return changed ? next : [...rows];
}

export function migrateTenants<T extends TenantSlice>(
  db: T,
): { db: T; changed: boolean } {
  if ((db.schemaVersion ?? 1) >= TENANT_SCHEMA_VERSION) {
    const tenants = db.tenants ?? [];
    if (tenants.length > 0) {
      return { db, changed: false };
    }
  }

  const now = new Date().toISOString();
  const tenantId = DEFAULT_TENANT_ID;
  let changed = false;

  const tenants = [...(db.tenants ?? [])];
  if (!tenants.some((row) => row.id === tenantId)) {
    tenants.push(defaultTenantRecord(now));
    changed = true;
  }

  const users = stamp(db.users, tenantId);
  const customers = stamp(db.customers, tenantId);
  const sites = stamp(db.sites, tenantId);
  const machines = stamp(db.machines, tenantId);
  const quotes = stamp(db.quotes, tenantId);
  const tickets = stamp(db.tickets, tenantId);
  const manuals = stamp(db.manuals, tenantId);
  const machineUsage = stamp(db.machineUsage, tenantId);
  const bugReports = stamp(db.bugReports, tenantId);
  const machineViews = stamp(db.machineViews, tenantId);

  if (
    users !== db.users ||
    customers !== db.customers ||
    sites !== db.sites ||
    machines !== db.machines ||
    quotes !== db.quotes ||
    tickets !== db.tickets ||
    manuals !== db.manuals ||
    machineUsage !== db.machineUsage ||
    bugReports !== db.bugReports ||
    machineViews !== db.machineViews
  ) {
    changed = true;
  }

  if ((db.schemaVersion ?? 1) < TENANT_SCHEMA_VERSION) {
    changed = true;
  }

  if (!changed) {
    return { db, changed: false };
  }

  return {
    db: {
      ...db,
      schemaVersion: TENANT_SCHEMA_VERSION,
      tenants,
      users,
      customers,
      sites,
      machines,
      quotes,
      tickets,
      manuals,
      machineUsage,
      bugReports,
      machineViews,
    },
    changed: true,
  };
}

export function newTenantId() {
  return `tenant-${randomUUID()}`;
}

export function newTenantFromName(name: string, now = new Date().toISOString()) {
  const trimmed = name.trim();
  const base = slugifyTenant(trimmed);
  return {
    id: newTenantId(),
    name: trimmed,
    slug: base,
    createdAt: now,
  };
}
