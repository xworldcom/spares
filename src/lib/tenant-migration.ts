import { randomUUID } from "node:crypto";
import type { CustomerAccount, Site } from "../types/index.ts";
import {
  DEFAULT_TENANT_ID,
  TENANT_SCHEMA_VERSION,
  defaultTenantRecord,
  platformOwnerEmails,
  slugifyTenant,
} from "./tenant.ts";

type TenantUser = { tenantId?: string; role?: string; email?: string };
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

/** Legacy rows keep an explicit tenant; never overwrite an existing tenantId. */
function stampMissing<T extends { tenantId?: string }>(
  rows: readonly T[] | undefined,
  tenantId: string,
): { rows: T[]; changed: boolean } {
  if (!rows?.length) {
    return { rows: [], changed: false };
  }
  let changed = false;
  const next = rows.map((row) => {
    if (row.tenantId) {
      return row;
    }
    changed = true;
    return { ...row, tenantId };
  });
  return { rows: changed ? next : [...rows], changed };
}

function isKnownHostStaffEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (platformOwnerEmails().has(normalized)) {
    return true;
  }
  return normalized === "staff@spares.local";
}

/** Staff auto-stamped to the host tenant while a single satellite tenant exists. */
function repairMisassignedStaffUsers(
  users: TenantUser[] | undefined,
  tenants: NonNullable<TenantSlice["tenants"]>,
): { users: TenantUser[]; changed: boolean } {
  if (!users?.length) {
    return { users: [], changed: false };
  }
  const satellites = tenants.filter((row) => row.id !== DEFAULT_TENANT_ID);
  if (satellites.length !== 1) {
    return { users: [...users], changed: false };
  }
  const satelliteId = satellites[0].id;
  let changed = false;
  const next = users.map((user) => {
    if (user.role !== "staff" || !user.email || isKnownHostStaffEmail(user.email)) {
      return user;
    }
    if (user.tenantId === satelliteId) {
      return user;
    }
    if (user.tenantId && user.tenantId !== DEFAULT_TENANT_ID) {
      return user;
    }
    changed = true;
    return { ...user, tenantId: satelliteId };
  });
  return { users: changed ? next : [...users], changed };
}

export function migrateTenants<T extends TenantSlice>(
  db: T,
): { db: T; changed: boolean } {
  const now = new Date().toISOString();
  const tenantId = DEFAULT_TENANT_ID;
  let changed = false;

  const tenants = [...(db.tenants ?? [])];
  if (!tenants.some((row) => row.id === tenantId)) {
    tenants.push(defaultTenantRecord(now));
    changed = true;
  }

  const initial = (db.schemaVersion ?? 1) < TENANT_SCHEMA_VERSION;
  const multiTenant = tenants.length > 1;

  const stampRows = <R extends { tenantId?: string }>(
    rows: readonly R[] | undefined,
  ): R[] => {
    if (initial) {
      return stamp(rows, tenantId);
    }
    const { rows: next, changed: rowChanged } = stampMissing(rows, tenantId);
    if (rowChanged) {
      changed = true;
    }
    return next;
  };

  const stampUserRows = (): TenantUser[] => {
    const rows = db.users;
    if (!rows?.length) {
      return [];
    }
    if (initial) {
      return stamp(rows, tenantId);
    }
    if (multiTenant) {
      return [...rows];
    }
    const { rows: next, changed: rowChanged } = stampMissing(rows, tenantId);
    if (rowChanged) {
      changed = true;
    }
    return next;
  };

  const users = stampUserRows();
  const repaired = repairMisassignedStaffUsers(users, tenants);
  if (repaired.changed) {
    changed = true;
  }
  const usersFinal = repaired.users;
  const customers = stampRows(db.customers);
  const sites = stampRows(db.sites);
  const machines = stampRows(db.machines);
  const quotes = stampRows(db.quotes);
  const tickets = stampRows(db.tickets);
  const manuals = stampRows(db.manuals);
  const machineUsage = stampRows(db.machineUsage);
  const bugReports = stampRows(db.bugReports);
  const machineViews = stampRows(db.machineViews);

  if (initial) {
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
      users: usersFinal,
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
