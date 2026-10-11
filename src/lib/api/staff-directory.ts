import { apiFetchList, invalidateListEtag, prefetchList } from "./list-fetch";
import type { CustomerAccount, PublicUser } from "./types";
import { invalidateWarmRead } from "./warm-read";

export type StaffHostDirectoryResponse = {
  accounts: Array<CustomerAccount & { siteCount: number }>;
  customers: PublicUser[];
  staff: Array<{ id: string; email: string; tenantId: string | null }>;
};

const HOST_DIRECTORY_PATH = "/api/staff/directory";
const HOST_DIRECTORY_KEY = "staff:host-directory";

export function invalidateStaffHostDirectoryCache() {
  invalidateWarmRead(HOST_DIRECTORY_KEY);
  invalidateListEtag(HOST_DIRECTORY_PATH);
}

export async function fetchStaffHostDirectory(
  init?: Pick<RequestInit, "signal">,
): Promise<StaffHostDirectoryResponse> {
  return apiFetchList<StaffHostDirectoryResponse>(HOST_DIRECTORY_PATH, HOST_DIRECTORY_KEY, init);
}

export function prefetchStaffHostDirectory() {
  prefetchList(HOST_DIRECTORY_PATH, HOST_DIRECTORY_KEY);
}
