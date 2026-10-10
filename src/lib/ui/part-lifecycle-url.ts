import type { PartLifecycleStatus } from "@/types";

const STATUS_VALUES = new Set<PartLifecycleStatus | "all">([
  "all",
  "unknown",
  "active",
  "announced",
  "obsolete",
]);

export type PartLifecycleUrlFilters = {
  status: PartLifecycleStatus | "all";
  machineId: string;
  q: string;
};

export function partLifecycleFiltersFromSearch(
  search: URLSearchParams,
): PartLifecycleUrlFilters {
  const rawStatus = search.get("status") ?? "all";
  const status = STATUS_VALUES.has(rawStatus as PartLifecycleStatus | "all")
    ? (rawStatus as PartLifecycleStatus | "all")
    : "all";
  return {
    status,
    machineId: search.get("machine")?.trim() ?? "",
    q: search.get("q")?.trim() ?? "",
  };
}

export function partLifecycleSearchParams(
  filters: PartLifecycleUrlFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.machineId) {
    params.set("machine", filters.machineId);
  }
  if (filters.q) {
    params.set("q", filters.q);
  }
  return params;
}

export function staffPartLifecycleHref(filters: PartLifecycleUrlFilters): string {
  const params = partLifecycleSearchParams(filters);
  const qs = params.toString();
  return qs ? `/staff/parts?${qs}` : "/staff/parts";
}
