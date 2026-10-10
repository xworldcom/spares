import { apiFetch } from "./client";
import type { CustomerAccount, PublicUser, Site } from "./types";

export type PlatformDirectoryUserDetail = {
  user: PublicUser;
  role: "customer" | "staff";
  hostId: string;
  hostName: string;
  sites: Site[];
  customers: CustomerAccount[];
  machines: Array<{ id: string; name: string; siteId?: string }>;
  protectedLogin: boolean;
};

export async function getPlatformDirectoryUser(userId: string) {
  return apiFetch<PlatformDirectoryUserDetail>(
    `/api/platform/directory/users/${encodeURIComponent(userId)}`,
  );
}

export async function updatePlatformDirectoryUser(
  userId: string,
  patch: {
    name?: string | null;
    email?: string;
    siteIds?: string[];
    machineIds?: string[];
    lifecycleNotifyObsolete?: boolean;
  },
) {
  const data = await apiFetch<{ user: PublicUser }>(
    `/api/platform/directory/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return data.user;
}

export async function deletePlatformDirectoryUser(userId: string) {
  await apiFetch<{ ok: true }>(
    `/api/platform/directory/users/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export type PlatformDirectoryCustomerDetail = {
  account: CustomerAccount;
  hostId: string;
  hostName: string;
  sites: Array<Site & { machineCount: number }>;
};

export async function getPlatformDirectoryCustomer(customerId: string) {
  return apiFetch<PlatformDirectoryCustomerDetail>(
    `/api/platform/directory/customers/${encodeURIComponent(customerId)}`,
  );
}

export async function updatePlatformDirectoryCustomer(customerId: string, name: string) {
  const data = await apiFetch<{ account: CustomerAccount }>(
    `/api/platform/directory/customers/${encodeURIComponent(customerId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name }),
    },
  );
  return data.account;
}

export async function deletePlatformDirectoryCustomer(customerId: string) {
  await apiFetch<{ ok: true }>(
    `/api/platform/directory/customers/${encodeURIComponent(customerId)}`,
    { method: "DELETE" },
  );
}

export async function deletePlatformDirectorySite(siteId: string) {
  await apiFetch<{ ok: true }>(
    `/api/platform/directory/sites/${encodeURIComponent(siteId)}`,
    { method: "DELETE" },
  );
}

export async function deletePlatformTenant(tenantId: string) {
  await apiFetch<{ ok: true }>(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, {
    method: "DELETE",
  });
}
