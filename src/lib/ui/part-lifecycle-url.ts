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
  options?: { highlight?: string },
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
  const highlight = options?.highlight?.trim();
  if (highlight) {
    params.set("highlight", highlight);
  }
  return params;
}

export function staffPartLifecycleHref(
  filters: PartLifecycleUrlFilters,
  options?: { highlight?: string },
): string {
  const params = partLifecycleSearchParams(filters, options);
  const qs = params.toString();
  return qs ? `/staff/parts?${qs}` : "/staff/parts";
}

export function staffPartLifecycleViewHref(partNumber: string): string {
  const trimmed = partNumber.trim();
  return staffPartLifecycleHref(
    { status: "all", machineId: "", q: trimmed },
    { highlight: trimmed },
  );
}

export function machinePartViewHref(machineId: string, partNumber: string): string {
  const id = machineId.trim();
  const part = partNumber.trim();
  if (!id || !part) {
    return "/machines";
  }
  const params = new URLSearchParams({ part });
  return `/machines/${encodeURIComponent(id)}?${params.toString()}`;
}
