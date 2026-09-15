import { ticketIsOpen } from "./care.ts";
import { belongsToTenant, DEFAULT_TENANT_ID, filterByTenant } from "./tenant.ts";
import type {
  CustomerAccount,
  MachineUsage,
  QuoteRecord,
  Role,
  ServiceTicketRecord,
  Site,
  Tenant,
} from "../types/index.ts";

type MetricUser = {
  role: Role;
  deletedAt?: string;
  tenantId?: string;
};

type MetricMachine = {
  createdAt: string;
  tenantId?: string;
};

export const PLATFORM_USAGE_WINDOW_DAYS = 30;

export type TenantSizeMetrics = {
  staffUsers: number;
  customerPeople: number;
  customers: number;
  sites: number;
  machines: number;
  openTickets: number;
  openQuotes: number;
};

export type TenantUsageMetrics = {
  windowDays: number;
  label: string;
  machinesCreated: number;
  quotesCreated: number;
  ticketsCreated: number;
  usageRowUpdates: number;
};

export type PlatformDeploymentRow = {
  tenant: Tenant;
  kind: "host" | "satellite";
  inactive: boolean;
  size: TenantSizeMetrics;
  usage: TenantUsageMetrics;
};

export type PlatformCatalogSlice = {
  users: readonly MetricUser[];
  customers?: readonly CustomerAccount[];
  sites?: readonly Site[];
  machines: readonly MetricMachine[];
  quotes: readonly QuoteRecord[];
  tickets?: readonly ServiceTicketRecord[];
  machineUsage?: readonly MachineUsage[];
};

function isActiveRow(row: { deletedAt?: string }) {
  return !row.deletedAt;
}

function quoteIsOpen(status: string) {
  return status !== "closed" && status !== "cancelled";
}

function withinWindow(iso: string | undefined, sinceMs: number) {
  if (!iso) {
    return false;
  }
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= sinceMs;
}

export function tenantDeploymentKind(tenantId: string): "host" | "satellite" {
  return tenantId === DEFAULT_TENANT_ID ? "host" : "satellite";
}

export function computeTenantSizeMetrics(
  tenantId: string,
  catalog: PlatformCatalogSlice,
): TenantSizeMetrics {
  const users = catalog.users.filter((user) => !user.deletedAt && belongsToTenant(user, tenantId));
  const staffUsers = users.filter((user) => user.role === "staff").length;
  const customerPeople = users.filter((user) => user.role === "customer").length;

  const customers = filterByTenant(catalog.customers ?? [], tenantId).filter(isActiveRow);
  const sites = filterByTenant(catalog.sites ?? [], tenantId).filter(isActiveRow);
  const machines = filterByTenant(catalog.machines, tenantId);

  const quotes = filterByTenant(catalog.quotes, tenantId).filter((quote) =>
    quoteIsOpen(quote.status),
  );
  const tickets = filterByTenant(catalog.tickets ?? [], tenantId).filter((ticket) =>
    ticketIsOpen(ticket.status),
  );

  return {
    staffUsers,
    customerPeople,
    customers: customers.length,
    sites: sites.length,
    machines: machines.length,
    openQuotes: quotes.length,
    openTickets: tickets.length,
  };
}

export function computeTenantUsageMetrics(
  tenantId: string,
  catalog: PlatformCatalogSlice,
  windowDays = PLATFORM_USAGE_WINDOW_DAYS,
  now = Date.now(),
): TenantUsageMetrics {
  const sinceMs = now - windowDays * 24 * 60 * 60 * 1000;

  const machinesCreated = filterByTenant(catalog.machines, tenantId).filter((row) =>
    withinWindow(row.createdAt, sinceMs),
  ).length;

  const quotesCreated = filterByTenant(catalog.quotes, tenantId).filter((row) =>
    withinWindow(row.createdAt, sinceMs),
  ).length;

  const ticketsCreated = filterByTenant(catalog.tickets ?? [], tenantId).filter((row) =>
    withinWindow(row.createdAt, sinceMs),
  ).length;

  const usageRowUpdates = filterByTenant(catalog.machineUsage ?? [], tenantId).filter((row) =>
    withinWindow(row.updatedAt, sinceMs),
  ).length;

  return {
    windowDays,
    label: `Last ${windowDays} days (catalog timestamps)`,
    machinesCreated,
    quotesCreated,
    ticketsCreated,
    usageRowUpdates,
  };
}

export function buildPlatformDeploymentRow(
  tenant: Tenant,
  catalog: PlatformCatalogSlice,
  windowDays = PLATFORM_USAGE_WINDOW_DAYS,
  now = Date.now(),
): PlatformDeploymentRow {
  return {
    tenant,
    kind: tenantDeploymentKind(tenant.id),
    inactive: Boolean(tenant.inactiveAt),
    size: computeTenantSizeMetrics(tenant.id, catalog),
    usage: computeTenantUsageMetrics(tenant.id, catalog, windowDays, now),
  };
}
