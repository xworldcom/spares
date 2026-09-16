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
