import type { DirectoryEntry } from "@/lib/platform-directory";
import { apiFetch } from "./client";
import { apiFetchList, invalidateListEtag, prefetchList } from "./list-fetch";
import type { CustomerAccount, PublicUser, Site } from "./types";
import { invalidateWarmRead } from "./warm-read";

const PLATFORM_DIRECTORY_PATH = "/api/platform/directory";
const PLATFORM_DIRECTORY_KEY = "platform:directory";

export function invalidatePlatformDirectoryListCache() {
  invalidateWarmRead(PLATFORM_DIRECTORY_KEY);
  invalidateListEtag(PLATFORM_DIRECTORY_PATH);
}

export async function listPlatformDirectoryEntries(): Promise<DirectoryEntry[]> {
  const data = await apiFetchList<{ entries: DirectoryEntry[] }>(
    PLATFORM_DIRECTORY_PATH,
    PLATFORM_DIRECTORY_KEY,
  );
  return data.entries ?? [];
}

export function prefetchPlatformDirectory() {
  prefetchList(PLATFORM_DIRECTORY_PATH, PLATFORM_DIRECTORY_KEY);
}

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
