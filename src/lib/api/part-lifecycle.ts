import { apiFetch } from "./client";
import { apiFetchList, invalidateListEtag, prefetchList, seedListSlot } from "./list-fetch";
import { invalidateWarmRead } from "./warm-read";
import type { PartLifecycleInfo, PartLifecycleStatus } from "@/types";
import type { PartLifecycleStatusCounts } from "@/lib/part-lifecycle";

/** One catalog row per PN; machines are the union of BOM references for that PN. */
export type StaffPartCatalogRow = {
  partNumber: string;
  name: string;
  machineIds: string[];
  machineNames: string[];
  lifecycle: PartLifecycleInfo;
};

export type StaffPartLifecycleResponse = {
  tenantId: string;
  parts: StaffPartCatalogRow[];
  statusCounts: PartLifecycleStatusCounts;
  machines: Array<{ id: string; name: string; siteId?: string }>;
  generatedAt: string;
};

function partLifecyclePath(filters?: {
  status?: PartLifecycleStatus | "all";
  machineId?: string;
  q?: string;
  tenantId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters?.machineId) {
    params.set("machineId", filters.machineId);
  }
  if (filters?.q) {
    params.set("q", filters.q);
  }
  if (filters?.tenantId) {
    params.set("tenantId", filters.tenantId);
  }
  const query = params.toString();
  return `/api/staff/part-lifecycle${query ? `?${query}` : ""}`;
}

function partLifecycleWarmKey(filters?: {
  status?: PartLifecycleStatus | "all";
  machineId?: string;
  q?: string;
  tenantId?: string;
}) {
  return [
    "staff:part-lifecycle",
    filters?.tenantId ?? "",
    filters?.status ?? "all",
    filters?.machineId ?? "",
    filters?.q ?? "",
  ].join(":");
}

export function invalidateStaffPartLifecycleListCache() {
  invalidateWarmRead("staff:part-lifecycle");
}

export function prefetchStaffPartLifecycleDefault() {
  const path = partLifecyclePath();
  prefetchList(path, partLifecycleWarmKey());
}

export function seedStaffPartLifecycleListSlot(
  body: StaffPartLifecycleResponse,
  etag: string,
  filters?: {
    status?: PartLifecycleStatus | "all";
    machineId?: string;
    q?: string;
    tenantId?: string;
  },
) {
  seedListSlot(partLifecycleWarmKey(filters), partLifecyclePath(filters), body, etag);
}

export async function fetchStaffPartLifecycle(
  filters?: {
    status?: PartLifecycleStatus | "all";
    machineId?: string;
    q?: string;
    tenantId?: string;
  },
  init?: Pick<RequestInit, "signal">,
) {
  const path = partLifecyclePath(filters);
  const warmKey = partLifecycleWarmKey(filters);
  return apiFetchList<StaffPartLifecycleResponse>(path, warmKey, init);
}

export async function saveStaffPartLifecycle(input: {
  partNumber: string;
  patch: Partial<PartLifecycleInfo>;
  tenantId?: string;
}) {
  const query = input.tenantId ? `?tenantId=${encodeURIComponent(input.tenantId)}` : "";
  const result = await apiFetch<{ ok: true; parts: StaffPartCatalogRow[] }>(
    `/api/staff/part-lifecycle${query}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        partNumber: input.partNumber,
        ...input.patch,
      }),
    },
  );
  invalidateStaffPartLifecycleListCache();
  invalidateListEtag("/api/staff/part-lifecycle");
  return result;
}

export async function bulkSaveStaffPartLifecycle(input: {
  updates: Array<{ partNumber: string; patch: Partial<PartLifecycleInfo> }>;
  tenantId?: string;
}) {
  const query = input.tenantId ? `?tenantId=${encodeURIComponent(input.tenantId)}` : "";
  const result = await apiFetch<{ ok: true; parts: StaffPartCatalogRow[] }>(
    `/api/staff/part-lifecycle${query}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        updates: input.updates.map(({ partNumber, patch }) => ({
          partNumber,
          ...patch,
        })),
      }),
    },
  );
  invalidateStaffPartLifecycleListCache();
  invalidateListEtag("/api/staff/part-lifecycle");
  return result;
}

/** Customer/staff lookup by part number (tenant from session). */
export async function lookupPartLifecycle(partNumbers: string[]) {
  const unique = [...new Set(partNumbers.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return {} as Record<string, PartLifecycleInfo>;
  }
  const params = new URLSearchParams();
  for (const partNumber of unique) {
    params.append("partNumber", partNumber);
  }
  const result = await apiFetch<{ parts: Record<string, PartLifecycleInfo> }>(
    `/api/part-lifecycle/lookup?${params.toString()}`,
  );
  return result.parts;
}
