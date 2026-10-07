import { apiFetch } from "./client";
import type { PartLifecycleInfo, PartLifecycleStatus } from "@/types";

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
  machines: Array<{ id: string; name: string; siteId?: string }>;
  generatedAt: string;
};

export async function fetchStaffPartLifecycle(filters?: {
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
  return apiFetch<StaffPartLifecycleResponse>(
    `/api/staff/part-lifecycle${query ? `?${query}` : ""}`,
  );
}

export async function saveStaffPartLifecycle(input: {
  partNumber: string;
  patch: Partial<PartLifecycleInfo>;
  tenantId?: string;
}) {
  const query = input.tenantId ? `?tenantId=${encodeURIComponent(input.tenantId)}` : "";
  return apiFetch<{ ok: true; parts: StaffPartCatalogRow[] }>(
    `/api/staff/part-lifecycle${query}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        partNumber: input.partNumber,
        ...input.patch,
      }),
    },
  );
}

export async function bulkSaveStaffPartLifecycle(input: {
  updates: Array<{ partNumber: string; patch: Partial<PartLifecycleInfo> }>;
  tenantId?: string;
}) {
  const query = input.tenantId ? `?tenantId=${encodeURIComponent(input.tenantId)}` : "";
  return apiFetch<{ ok: true; parts: StaffPartCatalogRow[] }>(
    `/api/staff/part-lifecycle${query}`,
    {
      method: "PATCH",
      body: JSON.stringify({ updates: input.updates }),
    },
  );
}
