import type { PublicUser } from "@/types";

export function listScopeKey(
  resource: "machines" | "quotes" | "tickets" | "staff-tickets",
  tenantId: string,
  user: Pick<PublicUser, "id" | "role">,
  extra?: string,
) {
  return [resource, tenantId, user.id, user.role, extra ?? ""].join(":");
}
