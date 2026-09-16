import { effectiveStaffTenantId, effectiveTenantId } from "./tenant.ts";
import type { CustomerAccount, Role, Tenant } from "../types/index.ts";

export type DirectoryEntryType = "host" | "customer" | "staff" | "person";

export type DirectoryEntry = {
  type: DirectoryEntryType;
  /** Row id in its own collection (tenant id, customer id, or user id). */
  id: string;
  name: string;
  /** Person email; hosts and customers have none. */
  email?: string;
  hostId: string;
  hostName: string;
  /** Host rows only (inactive tenant). */
  suspended?: boolean;
  createdAt?: string;
};

type DirectoryUser = {
  id: string;
  email: string;
  name?: string;
  role: Role;
  tenantId?: string;
  deletedAt?: string;
};

export type DirectoryCatalogSlice = {
  tenants: readonly Tenant[];
  customers: readonly CustomerAccount[];
  users: readonly DirectoryUser[];
};

function personDisplayName(user: { name?: string; email: string }) {
  const name = user.name?.trim();
  return name || user.email;
}

/**
 * Flat cross-host directory for platform owners: every host tenant, every
 * customer account, every staff login, and every customer person, each with a host column.
 */
export function buildPlatformDirectory(catalog: DirectoryCatalogSlice): DirectoryEntry[] {
  const hostNames = new Map(catalog.tenants.map((tenant) => [tenant.id, tenant.name]));
  const hostName = (tenantId: string) => hostNames.get(tenantId) ?? tenantId;

  const hosts: DirectoryEntry[] = [...catalog.tenants]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tenant) => ({
      type: "host",
      id: tenant.id,
      name: tenant.name,
      hostId: tenant.id,
      hostName: tenant.name,
      suspended: Boolean(tenant.inactiveAt),
      createdAt: tenant.createdAt,
    }));

  const customers: DirectoryEntry[] = catalog.customers
    .filter((row) => !row.deletedAt)
    .map((row) => {
      const tenantId = effectiveTenantId(row);
      return {
        type: "customer" as const,
        id: row.id,
        name: row.name,
        hostId: tenantId,
        hostName: hostName(tenantId),
        createdAt: row.createdAt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const staff: DirectoryEntry[] = catalog.users
    .filter((user) => user.role === "staff" && !user.deletedAt)
    .map((user) => {
      const tenantId = effectiveStaffTenantId(user) ?? effectiveTenantId(user);
      return {
        type: "staff" as const,
        id: user.id,
        name: personDisplayName(user),
        email: user.email,
        hostId: tenantId,
        hostName: hostName(tenantId),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const people: DirectoryEntry[] = catalog.users
    .filter((user) => user.role === "customer" && !user.deletedAt)
    .map((user) => {
      const tenantId = effectiveTenantId(user);
      return {
        type: "person" as const,
        id: user.id,
        name: personDisplayName(user),
        email: user.email,
        hostId: tenantId,
        hostName: hostName(tenantId),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...hosts, ...customers, ...staff, ...people];
}

export function filterDirectoryEntries(
  entries: readonly DirectoryEntry[],
  options: { type?: DirectoryEntryType | "all"; query?: string },
): DirectoryEntry[] {
  const type = options.type && options.type !== "all" ? options.type : null;
  const query = options.query?.trim().toLowerCase() ?? "";
  return entries.filter((entry) => {
    if (type && entry.type !== type) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [entry.name, entry.email ?? "", entry.hostName, entry.hostId, entry.id].some(
      (field) => field.toLowerCase().includes(query),
    );
  });
}
