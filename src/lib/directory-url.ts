import type { DirectoryEntryType } from "./platform-directory.ts";

export type DirectoryTypeFilter = DirectoryEntryType | "all";

const TYPE_VALUES = new Set<string>(["all", "host", "customer", "staff", "person"]);

export function directoryTypeFromSearchParam(
  value: string | null | undefined,
): DirectoryTypeFilter {
  if (!value || !TYPE_VALUES.has(value)) {
    return "all";
  }
  return value as DirectoryTypeFilter;
}

export function directoryHref(type: DirectoryTypeFilter = "all"): string {
  if (type === "all") {
    return "/staff/directory";
  }
  return `/staff/directory?type=${encodeURIComponent(type)}`;
}
