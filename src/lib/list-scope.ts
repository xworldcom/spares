import type { PublicUser } from "@/types";

export function listScopeKey(
  resource: "machines" | "quotes" | "tickets" | "staff-tickets",
  tenantId: string,
  user: Pick<PublicUser, "id" | "role">,
  extra?: string,
) {
  return [resource, tenantId, user.id, user.role, extra ?? ""].join(":");
}

export function staffHostDirectoryScopeKey(tenantId: string) {
  return `staff-host-directory:${tenantId}`;
}

export function platformDirectoryScopeKey() {
  return "platform-directory";
}

export function partLifecycleListScopeKey(
  tenantId: string,
  filters: { status?: string; machineId?: string; q?: string },
) {
  return [
    "part-lifecycle",
    tenantId,
    filters.status ?? "all",
    filters.machineId ?? "",
    filters.q ?? "",
  ].join(":");
}
