import type { Tenant } from "../types/index.ts";

/** Canonical id for migrated Soft Launch / Kevin host data (tenant #1). */
export const DEFAULT_TENANT_ID = "tenant-oee360-host";

export const DEFAULT_TENANT_NAME = "OEE360 Host";
export const DEFAULT_TENANT_SLUG = "oee360-host";

export const TENANT_SCHEMA_VERSION = 3;

export function defaultTenantRecord(now = new Date().toISOString()): Tenant {
  return {
    id: DEFAULT_TENANT_ID,
    name: DEFAULT_TENANT_NAME,
    slug: DEFAULT_TENANT_SLUG,
    createdAt: now,
  };
}

export function slugifyTenant(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "host";
}

export function platformOwnerEmails(): Set<string> {
  const raw =
    process.env.SPARES_PLATFORM_OWNER_EMAILS?.trim() ||
    process.env.SPARES_OWNER_EMAIL?.trim() ||
    "kevin@huzevka.com";
  return new Set(
    raw
      .split(",")
      .map((row) => row.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformOwnerEmail(email: string) {
  return platformOwnerEmails().has(email.trim().toLowerCase());
}

export function effectiveTenantId(row: { tenantId?: string }) {
  return row.tenantId ?? DEFAULT_TENANT_ID;
}

export function belongsToTenant<T extends { tenantId?: string }>(
  row: T,
  tenantId: string,
) {
  if (tenantId === DEFAULT_TENANT_ID) {
    return effectiveTenantId(row) === DEFAULT_TENANT_ID;
  }
  return row.tenantId === tenantId;
}

export function filterByTenant<T extends { tenantId?: string }>(
  rows: readonly T[],
  tenantId: string,
) {
  return rows.filter((row) => belongsToTenant(row, tenantId));
}

/** Session/API tenant scope — never default to the host tenant when unset. */
export function tenantIdForUser(user: { tenantId?: string }) {
  const id = user.tenantId?.trim();
  return id || null;
}

/** Use after auth when a tenant-scoped user is required. */
export function userTenantId(user: { tenantId?: string }) {
  const id = tenantIdForUser(user);
  if (!id) {
    throw new Error("Authenticated user is missing tenantId");
  }
  return id;
}
